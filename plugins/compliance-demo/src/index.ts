import { Agent, type AgentContext, type AgentMeta, type KernelEvent } from '@vfos/sdk';

interface TrendDiscoveredPayload {
  asset_id: string;
  url: string;
  region: string;
  niche: string;
  viral_score: number;
}

interface FUTSComponents {
  audio_change: number;
  visual_change: number;
  textual_change: number;
  branding_change: number;
  temporal_change: number;
  perceptual_hash_similarity: number;
}

interface GateResult {
  decision: 'PASS' | 'REJECT' | 'HUMAN_REVIEW';
  layer: string | null;
  asset_id: string;
  futs: { score: number; passed: boolean; reasons: readonly string[] };
  policy: { risk: number; flags: string[]; reasoning: string; model: string } | null;
  cost_cents: number;
}

// Deterministic FUTS profile per video URL — designed so the 3 sample videos
// hit different decision paths (PASS via policy, PASS pure FUTS, REJECT at FUTS).
const FUTS_PROFILE_BY_URL_SUFFIX: Readonly<Record<string, FUTSComponents>> = {
  '1001': {
    audio_change: 1.0,
    visual_change: 0.92,
    textual_change: 0.85,
    branding_change: 1.0,
    temporal_change: 0.9,
    perceptual_hash_similarity: 0.22,
  },
  '1002': {
    audio_change: 1.0,
    visual_change: 0.92,
    textual_change: 0.82,
    branding_change: 1.0,
    temporal_change: 0.88,
    perceptual_hash_similarity: 0.18,
  },
  '1003': {
    audio_change: 0.4,
    visual_change: 0.5,
    textual_change: 0.3,
    branding_change: 0.0,
    temporal_change: 0.2,
    perceptual_hash_similarity: 0.62,
  },
};

const DEFAULT_PROFILE: FUTSComponents = {
  audio_change: 0.6,
  visual_change: 0.6,
  textual_change: 0.6,
  branding_change: 0.6,
  temporal_change: 0.6,
  perceptual_hash_similarity: 0.4,
};

function pickProfile(url: string): FUTSComponents {
  for (const [suffix, profile] of Object.entries(FUTS_PROFILE_BY_URL_SUFFIX)) {
    if (url.endsWith(suffix)) return profile;
  }
  return DEFAULT_PROFILE;
}

export class ComplianceDemo extends Agent {
  override readonly meta: AgentMeta = {
    name: 'compliance-demo',
    version: '0.2.0',
    scopes: ['compliance.read', 'queue.write'],
    // compliance.gate fires LLM policy checks and enqueues renders —
    // both billable and side-effectful, so a replayed trend must NOT
    // retrigger the pipeline.
    ignore_replays: true,
  };

  override async onLoad(ctx: AgentContext): Promise<void> {
    ctx.logger.info('compliance-demo loaded — subscribing to trend.discovered.v1');
    ctx.subscribe<TrendDiscoveredPayload>('trend.discovered.v1', async (event) => {
      await this.handleTrend(ctx, event);
    });
  }

  override async run(_ctx: AgentContext): Promise<void> {
    // pure subscriber, no loop
  }

  private async handleTrend(
    ctx: AgentContext,
    event: KernelEvent<TrendDiscoveredPayload>,
  ): Promise<void> {
    const payload = event.payload;
    const components = pickProfile(payload.url);
    const transcript = `${payload.niche.replaceAll('_', ' ')} content sourced from ${payload.region}`;
    try {
      const result = await ctx.syscall<GateResult>('compliance.gate', {
        asset_id: payload.asset_id,
        components,
        policy: { transcript, niche: payload.niche },
      });
      ctx.logger.info(
        {
          asset_id: result.asset_id,
          decision: result.decision,
          futs_score: result.futs.score,
          policy_risk: result.policy?.risk ?? null,
        },
        'compliance.decision',
      );
      await ctx.emit('compliance.decision.v1', {
        asset_id: result.asset_id,
        decision: result.decision,
        layer: result.layer,
        futs_score: result.futs.score,
        futs_passed: result.futs.passed,
        futs_reasons: result.futs.reasons,
        policy: result.policy,
      });
      if (result.decision === 'PASS') {
        const priority = result.futs.score >= 0.75 ? 2 : 5;
        const enq = await ctx.syscall<{ job_id: string; queue: string }>('queue.enqueue', {
          queue: 'vfos.render',
          job_name: 'render-video',
          priority,
          data: {
            asset_id: payload.asset_id,
            niche: payload.niche,
            region: payload.region,
            futs_score: result.futs.score,
            duration_ms: 150,
          },
        });
        ctx.logger.info(
          { job_id: enq.job_id, asset_id: payload.asset_id, priority },
          'compliance-demo.render.enqueued',
        );
      }
    } catch (err) {
      ctx.logger.error({ err, asset_id: payload.asset_id }, 'compliance-demo.gate.failed');
    }
  }
}
