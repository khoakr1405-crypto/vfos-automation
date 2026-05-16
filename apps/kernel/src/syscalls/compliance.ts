import { z } from 'zod';
import type { AIRouter } from '../ai/router.js';
import { FUTS_THRESHOLD, computeFUTS } from '../security/futs.js';
import type { SyscallSpec } from '../syscall-registry.js';
import { instruments } from '../telemetry/instruments.js';

const FUTSInput = z.object({
  audio_change: z.number().min(0).max(1),
  visual_change: z.number().min(0).max(1),
  textual_change: z.number().min(0).max(1),
  branding_change: z.number().min(0).max(1),
  temporal_change: z.number().min(0).max(1),
  perceptual_hash_similarity: z.number().min(0).max(1),
});

const PolicyInput = z.object({
  transcript: z.string().min(1),
  niche: z.string().min(1),
  platforms: z
    .array(z.enum(['tiktok', 'facebook_reels', 'youtube_shorts']))
    .default(['tiktok', 'facebook_reels']),
});

const GateInput = z.object({
  asset_id: z.string().min(1),
  components: FUTSInput,
  policy: PolicyInput,
});

const POLICY_SYSTEM =
  'You are a senior platform-policy reviewer for TikTok and Facebook Reels. ' +
  'Score the given short-form video metadata for compliance risk. ' +
  'Risk dimensions: copyright/IP, sexual content, hate, violence, dangerous acts, medical claims, prohibited products. ' +
  'Return STRICT JSON only.';

const POLICY_SCHEMA = {
  type: 'object',
  required: ['risk', 'flags', 'reasoning'],
  properties: {
    risk: { type: 'number', minimum: 0, maximum: 1 },
    flags: { type: 'array', items: { type: 'string' } },
    reasoning: { type: 'string' },
  },
} as const;

interface PolicyJson {
  risk?: number;
  flags?: string[];
  reasoning?: string;
}

const REJECT_RISK = 0.7;
const REVIEW_RISK = 0.4;
const SAFE_FUTS_FLOOR = 0.75;

export function makeComplianceSyscalls(router: AIRouter): readonly SyscallSpec[] {
  const futsScore: SyscallSpec = {
    name: 'compliance.futs.score',
    description: 'Compute Fair-Use Threshold Score from transformation component metrics.',
    requiredScope: 'compliance.read',
    handler: async (_ctx, raw) => {
      const args = FUTSInput.parse(raw);
      return computeFUTS(args);
    },
  };

  const policyCheck: SyscallSpec = {
    name: 'compliance.policy.check',
    description: 'LLM-powered platform policy risk assessment (returns risk + flags).',
    requiredScope: 'compliance.read',
    handler: async (ctx, raw) => {
      const args = PolicyInput.parse(raw);
      const res = await router.run({
        intent: 'policy_check',
        system: POLICY_SYSTEM,
        user: JSON.stringify({
          transcript: args.transcript,
          niche: args.niche,
          platforms: args.platforms,
        }),
        tenant_id: ctx.tenant_id,
        json_schema: POLICY_SCHEMA as unknown as Record<string, unknown>,
      });
      const json = (res.json ?? {}) as PolicyJson;
      return {
        risk: typeof json.risk === 'number' ? json.risk : 0.5,
        flags: json.flags ?? [],
        reasoning: json.reasoning ?? 'no reasoning returned',
        model: res.model,
        cost_cents: res.cost_cents,
      };
    },
  };

  const gate: SyscallSpec = {
    name: 'compliance.gate',
    description: 'Orchestrate FUTS + policy.check, return final PASS/REJECT/HUMAN_REVIEW decision.',
    requiredScope: 'compliance.read',
    handler: async (ctx, raw) => {
      const args = GateInput.parse(raw);
      const m = instruments();
      const futs = computeFUTS(args.components);
      if (!futs.passed) {
        m.compliance_decision_total.add(1, { decision: 'REJECT', layer: 'futs' });
        return {
          decision: 'REJECT' as const,
          layer: 'futs',
          asset_id: args.asset_id,
          futs,
          policy: null,
          cost_cents: 0,
        };
      }
      const policy = await router.run({
        intent: 'policy_check',
        system: POLICY_SYSTEM,
        user: JSON.stringify({
          transcript: args.policy.transcript,
          niche: args.policy.niche,
          platforms: args.policy.platforms,
        }),
        tenant_id: ctx.tenant_id,
        json_schema: POLICY_SCHEMA as unknown as Record<string, unknown>,
      });
      const pj = (policy.json ?? {}) as PolicyJson;
      const risk = typeof pj.risk === 'number' ? pj.risk : 0.5;
      const flags = pj.flags ?? [];
      const reasoning = pj.reasoning ?? '';

      let decision: 'PASS' | 'REJECT' | 'HUMAN_REVIEW';
      let layer: string | null = null;
      if (risk > REJECT_RISK) {
        decision = 'REJECT';
        layer = 'policy';
      } else if (risk > REVIEW_RISK && futs.score < SAFE_FUTS_FLOOR) {
        decision = 'HUMAN_REVIEW';
        layer = 'edge';
      } else {
        decision = 'PASS';
      }
      m.compliance_decision_total.add(1, { decision, layer: layer ?? 'none' });

      return {
        decision,
        layer,
        asset_id: args.asset_id,
        futs,
        policy: { risk, flags, reasoning, model: policy.model },
        cost_cents: policy.cost_cents,
      };
    },
  };

  return [futsScore, policyCheck, gate];
}

export { FUTS_THRESHOLD };
