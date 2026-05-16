import { z } from 'zod';
import type { AIRouter } from '../ai/router.js';
import type { SyscallSpec } from '../syscall-registry.js';

const MetadataInput = z.object({
  title: z.string().default(''),
  description: z.string().default(''),
  transcript: z.string().default(''),
  tags: z.array(z.string()).default([]),
});

const EngagementInput = z.object({
  views: z.number().int().min(0),
  likes: z.number().int().min(0),
  shares: z.number().int().min(0).optional(),
});

const VoeInput = z.object({
  source_url: z.string().url(),
  platform: z.enum(['tiktok', 'douyin', 'youtube']),
  niche: z.string().min(1),
  metadata: MetadataInput,
  engagement: EngagementInput,
});

const VOE_SYSTEM =
  'You are a senior content strategist specializing in affiliate video monetization for the Vietnam market ' +
  '(Facebook Reels, TikTok Vietnam).\n' +
  'Your task: evaluate whether a foreign short-form video is worth re-uploading and localizing for ' +
  'Vietnamese affiliate marketing.\n\n' +
  'Key evaluation criteria:\n' +
  '- Viral potential in Vietnam (cultural fit, product desirability, localization feasibility)\n' +
  '- Affiliate monetization potential (product clarity, purchase intent signals, affiliate category fit)\n' +
  '- Platform suitability for Facebook Reels and TikTok Vietnam\n' +
  '- Practical risks (copyright, cultural mismatch, translation difficulty)\n\n' +
  'Score 0-100 (0 = completely unsuitable, 100 = perfect fit). Confidence 0-100 (how certain you are).\n' +
  'Verdict: PROCEED if score >= 60 and risks are manageable; SKIP otherwise.\n\n' +
  'Return STRICT JSON only. No markdown, no prose outside the JSON structure.';

const VOE_JSON_SCHEMA = {
  type: 'object',
  required: ['vi_evaluation', 'content_factory_handoff'],
  properties: {
    vi_evaluation: {
      type: 'object',
      required: [
        'score',
        'confidence',
        'verdict',
        'rationale',
        'risks',
        'target_audience',
        'affiliate_category',
      ],
      properties: {
        score: { type: 'number', minimum: 0, maximum: 100 },
        confidence: { type: 'number', minimum: 0, maximum: 100 },
        verdict: { type: 'string', enum: ['PROCEED', 'SKIP'] },
        rationale: { type: 'string' },
        risks: { type: 'array', items: { type: 'string' } },
        target_audience: { type: 'string' },
        affiliate_category: { type: 'string' },
      },
    },
    content_factory_handoff: {
      type: 'object',
      required: [
        'suggested_localization_angle',
        'suggested_edit_direction',
        'suggested_voice_style',
        'suggested_hook_angle',
      ],
      properties: {
        suggested_localization_angle: { type: 'string' },
        suggested_edit_direction: { type: 'string' },
        suggested_voice_style: { type: 'string' },
        suggested_hook_angle: { type: 'string' },
      },
    },
  },
} as const;

interface VoeJson {
  vi_evaluation?: {
    score?: unknown;
    confidence?: unknown;
    verdict?: unknown;
    rationale?: unknown;
    risks?: unknown;
    target_audience?: unknown;
    affiliate_category?: unknown;
  };
  content_factory_handoff?: {
    suggested_localization_angle?: unknown;
    suggested_edit_direction?: unknown;
    suggested_voice_style?: unknown;
    suggested_hook_angle?: unknown;
  };
}

export function makeVoeSyscalls(router: AIRouter): readonly SyscallSpec[] {
  const voeEvaluate: SyscallSpec = {
    name: 'agents.voe.evaluate',
    description:
      'Video Opportunity Evaluator: scores foreign video metadata for Vietnam affiliate reup potential.',
    requiredScope: 'agents.voe',
    auditable: true,
    handler: async (ctx, raw) => {
      const args = VoeInput.parse(raw);

      const res = await router.run({
        intent: 'voe_evaluate',
        system: VOE_SYSTEM,
        user: JSON.stringify({
          source_url: args.source_url,
          platform: args.platform,
          niche: args.niche,
          title: args.metadata.title,
          description: args.metadata.description,
          transcript: args.metadata.transcript,
          tags: args.metadata.tags,
          views: args.engagement.views,
          likes: args.engagement.likes,
          shares: args.engagement.shares ?? null,
        }),
        tenant_id: ctx.tenant_id,
        json_schema: VOE_JSON_SCHEMA as unknown as Record<string, unknown>,
      });

      const json = (res.json ?? {}) as VoeJson;
      const vi = json.vi_evaluation ?? {};
      const handoff = json.content_factory_handoff ?? {};

      return {
        vi_evaluation: {
          score: typeof vi.score === 'number' ? vi.score : 0,
          confidence: typeof vi.confidence === 'number' ? vi.confidence : 0,
          verdict: vi.verdict === 'PROCEED' ? 'PROCEED' : 'SKIP',
          rationale: typeof vi.rationale === 'string' ? vi.rationale : '',
          risks: Array.isArray(vi.risks) ? vi.risks : [],
          target_audience: typeof vi.target_audience === 'string' ? vi.target_audience : '',
          affiliate_category: typeof vi.affiliate_category === 'string' ? vi.affiliate_category : '',
        },
        content_factory_handoff: {
          suggested_localization_angle:
            typeof handoff.suggested_localization_angle === 'string'
              ? handoff.suggested_localization_angle
              : '',
          suggested_edit_direction:
            typeof handoff.suggested_edit_direction === 'string'
              ? handoff.suggested_edit_direction
              : '',
          suggested_voice_style:
            typeof handoff.suggested_voice_style === 'string' ? handoff.suggested_voice_style : '',
          suggested_hook_angle:
            typeof handoff.suggested_hook_angle === 'string' ? handoff.suggested_hook_angle : '',
        },
        model: res.model,
        cost_cents: res.cost_cents,
      };
    },
  };

  return [voeEvaluate];
}
