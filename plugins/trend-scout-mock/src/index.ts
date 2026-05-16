import { Agent, type AgentContext, type AgentMeta } from '@vfos/sdk';

const SAMPLE_TRENDS = [
  {
    url: 'https://www.tiktok.com/@example/video/1001',
    region: 'US',
    transcript: 'review of the best wireless bluetooth earbuds for under fifty dollars',
    views_per_hour: 18_500,
    engagement_rate: 0.082,
    saves_per_view: 0.011,
    comments_per_view: 0.004,
  },
  {
    url: 'https://www.tiktok.com/@example/video/1002',
    region: 'KR',
    transcript: 'top 5 korean sheet mask haul beauty routine glass skin',
    views_per_hour: 32_100,
    engagement_rate: 0.121,
    saves_per_view: 0.022,
    comments_per_view: 0.009,
  },
  {
    url: 'https://www.tiktok.com/@example/video/1003',
    region: 'JP',
    transcript: 'unboxing this rapid boil electric kettle perfect for tea',
    views_per_hour: 9_400,
    engagement_rate: 0.054,
    saves_per_view: 0.006,
    comments_per_view: 0.002,
  },
];

const NICHE_SCHEMA = {
  type: 'object',
  required: ['niche', 'confidence'],
  properties: {
    niche: { type: 'string', enum: ['audio_gadgets', 'skincare', 'home_kitchen', 'mobile_accessories', 'food_recipe', 'general'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
} as const;

const NICHE_SYSTEM =
  'You classify short-form video transcripts into a single niche bucket. ' +
  'Allowed niches: audio_gadgets, skincare, home_kitchen, mobile_accessories, food_recipe, general. ' +
  'Always return strict JSON.';

interface NicheClassification {
  niche: string;
  confidence: number;
}

export class TrendScoutMock extends Agent {
  override readonly meta: AgentMeta = {
    name: 'trend-scout-mock',
    version: '0.2.0',
    scopes: ['fs.write', 'trend.score', 'affiliate.read', 'ai.complete'],
    schedule: { intervalMs: 1000 },
    configSchema: {
      type: 'object',
      properties: {
        intervalMs: {
          type: 'integer',
          minimum: 50,
          maximum: 600_000,
          default: 1000,
          description: 'How often the scout ticks (ms). Lower = chattier feed.',
        },
        sample_marker: {
          type: 'string',
          maxLength: 80,
          description: 'Free-form tag echoed into agent logs — useful for A/B identification.',
        },
        region_filter: {
          type: 'string',
          enum: ['ALL', 'US', 'KR', 'JP'],
          default: 'ALL',
          description: 'Only emit trends from this region (ALL = no filter).',
        },
      },
    },
  };

  private timer: NodeJS.Timeout | null = null;

  override async onLoad(ctx: AgentContext): Promise<void> {
    ctx.logger.info('trend-scout-mock loaded');
  }

  override async run(ctx: AgentContext): Promise<void> {
    let idx = 0;
    const regionFilter = ctx.config.get('region_filter');
    const tick = async (): Promise<void> => {
      const sample = SAMPLE_TRENDS[idx % SAMPLE_TRENDS.length];
      if (!sample) return;
      idx += 1;
      if (
        typeof regionFilter === 'string' &&
        regionFilter !== 'ALL' &&
        sample.region !== regionFilter
      ) {
        return;
      }
      try {
        const classification = await ctx.syscall<{ json: NicheClassification; cost_cents: number; model: string }>(
          'ai.json',
          {
            intent: 'classify_niche',
            system: NICHE_SYSTEM,
            user: sample.transcript,
            schema: NICHE_SCHEMA,
          },
        );
        const niche = classification.json?.niche ?? 'general';

        const viral = await ctx.syscall<{ score: number }>('trend.score', {
          url: sample.url,
          views_per_hour: sample.views_per_hour,
          engagement_rate: sample.engagement_rate,
          saves_per_view: sample.saves_per_view,
          comments_per_view: sample.comments_per_view,
        });
        const matches = await ctx.syscall<{
          matches: { sku: string; affiliate_link: string; confidence: number }[];
        }>('affiliate.match_sku', { transcript: sample.transcript, top_k: 1 });
        const stored = await ctx.syscall<{ asset_id: string }>('fs.put', {
          mime: 'application/json',
          content: JSON.stringify({ ...sample, niche, viral, matches, classification }),
          tags: ['trend-source', sample.region, niche],
        });

        await ctx.emit('niche.classified.v1', {
          asset_id: stored.asset_id,
          niche,
          confidence: classification.json?.confidence ?? 0,
          model: classification.model,
          cost_cents: classification.cost_cents,
        });
        await ctx.emit('trend.discovered.v1', {
          asset_id: stored.asset_id,
          url: sample.url,
          region: sample.region,
          niche,
          viral_score: viral.score,
        });
        if (matches.matches.length > 0) {
          await ctx.emit('affiliate.matched.v1', {
            asset_id: stored.asset_id,
            top_match: matches.matches[0],
          });
        }
      } catch (err) {
        ctx.logger.error({ err }, 'trend-scout-mock.tick.failed');
      }
    };
    await tick();
    // Tenant config wins over the schedule baked into AgentMeta — lets
    // ops slow down a noisy agent or speed up a smoke test without
    // editing the plugin.
    const cfgInterval = ctx.config.get('intervalMs');
    const intervalMs =
      typeof cfgInterval === 'number' && cfgInterval >= 50
        ? cfgInterval
        : (this.meta.schedule?.intervalMs ?? 1000);
    ctx.logger.debug({ intervalMs, source: typeof cfgInterval === 'number' ? 'config' : 'default' }, 'trend-scout.tick.interval');
    this.timer = setInterval(() => void tick(), intervalMs);
  }

  override async onUnload(_ctx: AgentContext): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
