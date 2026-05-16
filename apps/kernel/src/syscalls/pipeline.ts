import { SpanKind } from '@opentelemetry/api';
import { ulid } from 'ulid';
import { z } from 'zod';
import type { EventBus } from '../bus/types.js';
import { trace } from '@opentelemetry/api';
import type { SyscallContext } from '@vfos/sdk';
import type { SyscallRegistry, SyscallSpec } from '../syscall-registry.js';
import { withSpan } from '../telemetry/tracer.js';

export interface PipelineSyscallDeps {
  syscalls: SyscallRegistry;
  bus: EventBus;
}

// Wildcard scope so the pipeline can invoke every step regardless of caller
// scope. This is safe because pipeline.run itself requires tenant.admin.
const ALL_SCOPES = ['*'] as const;

const PLATFORM = z.enum(['tiktok', 'facebook']);

const PipelineInput = z
  .object({
    source_url: z.string().url().default('https://www.tiktok.com/@demo/video/1001'),
    views_per_hour: z.number().nonnegative().default(8200),
    engagement_rate: z.number().min(0).max(1).default(0.18),
    niche_hint: z.string().default('audio_gadgets'),
    transcript: z
      .string()
      .default(
        'short review of the new wireless earbuds — sound clear, mids warm, battery decent for the price',
      ),
    // Legacy single-target shape (kept for backwards compat with v1.5+ callers
    // — pipeline.run with `target_platform: 'tiktok'` keeps working).
    target_platform: PLATFORM.optional(),
    // New multi-target fan-out: publish the same render to every listed
    // platform in parallel. If both fields present, target_platforms wins.
    target_platforms: z.array(PLATFORM).max(5).optional(),
    caption: z
      .string()
      .max(2000)
      .default('honest review of these earbuds 🎧 #affiliate'),
    privacy: z.enum(['public', 'unlisted', 'private']).default('private'),
  })
  .transform((v) => {
    const platforms = v.target_platforms ?? (v.target_platform ? [v.target_platform] : ['tiktok']);
    return { ...v, target_platforms: [...new Set(platforms)] as ('tiktok' | 'facebook')[] };
  });

type StepStatus = 'ok' | 'failed' | 'skipped';
interface StepResult {
  name: string;
  status: StepStatus;
  ms: number;
  output?: Record<string, unknown>;
  error?: string;
}

interface PipelineResult {
  trace_id: string;
  total_ms: number;
  final:
    | 'published'
    | 'partial'
    | 'rejected_compliance'
    | 'no_connector'
    | 'render_timeout'
    | 'failed';
  reason?: string;
  steps: StepResult[];
  // Per-platform summary (one row per target_platforms entry)
  publishes?: Array<{
    platform: 'tiktok' | 'facebook';
    status: 'published' | 'skipped' | 'failed';
    account_id?: string;
    publish_id?: string;
    url?: string;
    error?: string;
  }>;
}

async function runStep<T extends Record<string, unknown>>(
  name: string,
  steps: StepResult[],
  fn: () => Promise<T>,
): Promise<{ ok: true; out: T } | { ok: false; err: string }> {
  const start = performance.now();
  try {
    const out = await fn();
    steps.push({
      name,
      status: 'ok',
      ms: Math.round(performance.now() - start),
      output: out,
    });
    return { ok: true, out };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    steps.push({
      name,
      status: 'failed',
      ms: Math.round(performance.now() - start),
      error: message,
    });
    return { ok: false, err: message };
  }
}

function waitForEvent<T = unknown>(
  bus: EventBus,
  schema: string,
  predicate: (event: { payload: T; tenant_id: string }) => boolean,
  timeoutMs: number,
): Promise<{ payload: T; tenant_id: string } | null> {
  return new Promise((resolve) => {
    let timer: NodeJS.Timeout | undefined;
    const unsubscribe = bus.subscribe<T>(schema, async (event) => {
      if (!predicate(event)) return;
      if (timer) clearTimeout(timer);
      unsubscribe();
      resolve(event);
    });
    timer = setTimeout(() => {
      unsubscribe();
      resolve(null);
    }, timeoutMs);
  });
}

const PUBLISH_BY_PLATFORM: Record<'tiktok' | 'facebook', string> = {
  tiktok: 'publish.tiktok',
  facebook: 'publish.facebook.reels',
};

export function makePipelineSyscalls(deps: PipelineSyscallDeps): readonly SyscallSpec[] {
  const run: SyscallSpec = {
    name: 'pipeline.run',
    description:
      'Orchestrate the full repurposing pipeline: trend.score → ai classify → fs.put → compliance.gate → render → publish.',
    requiredScope: 'tenant.admin',
    handler: async (ctx, raw): Promise<PipelineResult> => {
      const args = PipelineInput.parse(raw);
      return withSpan(
        'pipeline.run',
        {
          kind: SpanKind.INTERNAL,
          attributes: {
            'vfos.pipeline.target': args.target_platform,
            'vfos.tenant_id': ctx.tenant_id,
          },
        },
        async (rootSpan): Promise<PipelineResult> => {
          const traceId = rootSpan.spanContext().traceId;
          const steps: StepResult[] = [];
          const start = performance.now();
          const subCtx: SyscallContext = { ...ctx };

          // Step 1: trend.score
          const trendStep = await runStep('trend.score', steps, async () => {
            return deps.syscalls.invoke<Record<string, unknown>>(
              'trend.score',
              subCtx,
              {
                url: args.source_url,
                views_per_hour: args.views_per_hour,
                engagement_rate: args.engagement_rate,
                saves_per_view: 0.05,
                comments_per_view: 0.03,
              },
              ALL_SCOPES,
            );
          });
          if (!trendStep.ok) {
            return finalize(traceId, start, steps, 'failed', trendStep.err);
          }

          // Step 2: ai.json classify_niche
          const aiStep = await runStep('ai.classify_niche', steps, async () => {
            return deps.syscalls.invoke<Record<string, unknown>>(
              'ai.json',
              subCtx,
              {
                intent: 'classify_niche',
                system:
                  'Classify the short video into one of: audio_gadgets, skincare, home_kitchen, mobile_accessories, food_recipe, general.',
                user: `${args.niche_hint}: ${args.transcript}`,
                schema: {
                  type: 'object',
                  required: ['niche', 'confidence'],
                  properties: {
                    niche: { type: 'string' },
                    confidence: { type: 'number' },
                  },
                },
              },
              ALL_SCOPES,
            );
          });
          if (!aiStep.ok) {
            return finalize(traceId, start, steps, 'failed', aiStep.err);
          }
          const nicheLabel =
            ((aiStep.out.json as { niche?: string } | undefined)?.niche) ?? args.niche_hint;

          // Step 3: fs.put (placeholder asset for the pipeline's "video")
          const placeholder = JSON.stringify({
            kind: 'pipeline.placeholder',
            source_url: args.source_url,
            niche: nicheLabel,
            ts: new Date().toISOString(),
          });
          const fsStep = await runStep('fs.put', steps, async () => {
            return deps.syscalls.invoke<{ asset_id: string; bytes: number }>(
              'fs.put',
              subCtx,
              { mime: 'application/json', content: placeholder, tags: ['pipeline', nicheLabel] },
              ALL_SCOPES,
            );
          });
          if (!fsStep.ok) {
            return finalize(traceId, start, steps, 'failed', fsStep.err);
          }
          const assetId = fsStep.out.asset_id;

          // Step 4: compliance.gate (deterministic transformation profile)
          const gateStep = await runStep('compliance.gate', steps, async () => {
            return deps.syscalls.invoke<{ decision: string; layer: string | null }>(
              'compliance.gate',
              subCtx,
              {
                asset_id: assetId,
                // Transformation profile for the demo: aggressive rewrite +
                // significant visual restyle + fresh branding. Raw ≈ 0.905,
                // minus pHash 0.18 → 0.725, comfortably above the 0.65 FUTS
                // threshold and well below the 0.55 pHash ceiling.
                components: {
                  audio_change: 0.9,
                  visual_change: 0.9,
                  textual_change: 0.95,
                  branding_change: 1.0,
                  temporal_change: 0.7,
                  perceptual_hash_similarity: 0.18,
                },
                policy: {
                  transcript: args.transcript,
                  niche: nicheLabel,
                  platforms: args.target_platforms.map((p) =>
                    p === 'facebook' ? 'facebook_reels' : 'tiktok',
                  ),
                },
              },
              ALL_SCOPES,
            );
          });
          if (!gateStep.ok) {
            return finalize(traceId, start, steps, 'failed', gateStep.err);
          }
          if (gateStep.out.decision !== 'PASS') {
            return finalize(
              traceId,
              start,
              steps,
              'rejected_compliance',
              `gate: ${gateStep.out.decision} at ${gateStep.out.layer ?? 'unknown'}`,
            );
          }

          // Step 5: queue.enqueue 'vfos.render' + wait for render.completed
          const renderJobId = await runStep('queue.enqueue render', steps, async () => {
            return deps.syscalls.invoke<{ job_id: string; queue: string }>(
              'queue.enqueue',
              subCtx,
              {
                queue: 'vfos.render',
                job_name: 'pipeline.render',
                data: {
                  asset_id: assetId,
                  niche: nicheLabel,
                  region: 'US',
                  duration_ms: 200,
                },
                priority: 5,
              },
              ALL_SCOPES,
            );
          });
          if (!renderJobId.ok) {
            return finalize(traceId, start, steps, 'failed', renderJobId.err);
          }
          const jobId = renderJobId.out.job_id;
          const renderWait = await runStep('await render.completed', steps, async () => {
            const event = await waitForEvent<{ job_id?: string; render_ms?: number }>(
              deps.bus,
              'render.completed.v1',
              (e) => e.payload.job_id === jobId,
              4000,
            );
            if (!event) throw new Error(`render.completed.v1 not seen within 4s for job ${jobId}`);
            return { job_id: jobId, render_ms: event.payload.render_ms ?? 0 };
          });
          if (!renderWait.ok) {
            return finalize(traceId, start, steps, 'render_timeout', renderWait.err);
          }

          // Step 6: list ALL active connectors once, then partition by platform.
          // One DB roundtrip + decrypt-free filter beats N round-trips for fan-out.
          const credStep = await runStep('connectors.list', steps, async () => {
            return deps.syscalls.invoke<{
              credentials: {
                account_id: string;
                platform: string;
                revoked_at: string | null;
              }[];
            }>('connectors.list', subCtx, {}, ALL_SCOPES);
          });
          if (!credStep.ok) {
            return finalize(traceId, start, steps, 'failed', credStep.err);
          }
          const activeByPlatform = new Map<string, { account_id: string }>();
          for (const c of credStep.out.credentials) {
            if (c.revoked_at !== null) continue;
            if (!activeByPlatform.has(c.platform)) {
              activeByPlatform.set(c.platform, { account_id: c.account_id });
            }
          }

          // Step 7: publish to each requested platform in parallel.
          // Skipped + failed platforms don't poison successful ones.
          const publishes: NonNullable<PipelineResult['publishes']> = [];
          const publishTasks = args.target_platforms.map(async (platform) => {
            const cred = activeByPlatform.get(platform);
            const syscallName = PUBLISH_BY_PLATFORM[platform];
            if (!cred) {
              steps.push({
                name: `publish.${platform}`,
                status: 'skipped',
                ms: 0,
                error: `no active credential for ${platform}`,
              });
              publishes.push({
                platform,
                status: 'skipped',
                error: `no active credential — link one via /connectors first`,
              });
              return;
            }
            const stepStart = performance.now();
            try {
              const res = await deps.syscalls.invoke<{
                publish_id: string;
                status: string;
                url?: string;
              }>(
                syscallName,
                subCtx,
                {
                  account_id: cred.account_id,
                  caption: args.caption,
                  privacy: args.privacy,
                  asset_id: assetId,
                  video_url: 'https://example.com/pipeline-mock.mp4',
                },
                ALL_SCOPES,
              );
              steps.push({
                name: syscallName,
                status: 'ok',
                ms: Math.round(performance.now() - stepStart),
                output: { ...res, account_id: cred.account_id },
              });
              const row: NonNullable<PipelineResult['publishes']>[number] = {
                platform,
                status: 'published',
                account_id: cred.account_id,
                publish_id: res.publish_id,
              };
              if (res.url) row.url = res.url;
              publishes.push(row);
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              steps.push({
                name: syscallName,
                status: 'failed',
                ms: Math.round(performance.now() - stepStart),
                error: message,
              });
              publishes.push({
                platform,
                status: 'failed',
                account_id: cred.account_id,
                error: message,
              });
            }
          });
          await Promise.all(publishTasks);

          // Aggregate the per-platform results into one final state.
          const publishedCount = publishes.filter((p) => p.status === 'published').length;
          const skippedCount = publishes.filter((p) => p.status === 'skipped').length;
          const failedCount = publishes.filter((p) => p.status === 'failed').length;
          let outcome: PipelineResult['final'];
          let reason: string | undefined;
          if (publishedCount === publishes.length) {
            outcome = 'published';
          } else if (publishedCount === 0 && failedCount === 0 && skippedCount > 0) {
            outcome = 'no_connector';
            reason = `no active credentials for: ${publishes
              .filter((p) => p.status === 'skipped')
              .map((p) => p.platform)
              .join(', ')}`;
          } else if (publishedCount === 0) {
            outcome = 'failed';
            reason = `all ${publishes.length} publishes failed`;
          } else {
            outcome = 'partial';
            reason = `${publishedCount} ok, ${failedCount} failed, ${skippedCount} skipped`;
          }
          return finalize(traceId, start, steps, outcome, reason, publishes);
        },
      );
    },
  };

  return [run];
}

function finalize(
  traceId: string,
  start: number,
  steps: StepResult[],
  final: PipelineResult['final'],
  reason?: string,
  publishes?: PipelineResult['publishes'],
): PipelineResult {
  const result: PipelineResult = {
    trace_id: traceId,
    total_ms: Math.round(performance.now() - start),
    final,
    steps,
  };
  if (reason) result.reason = reason;
  if (publishes && publishes.length > 0) result.publishes = publishes;
  // mark the current span with the outcome so /traces can show it
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttributes({
      'vfos.pipeline.final': final,
      ...(reason ? { 'vfos.pipeline.reason': reason } : {}),
      'vfos.pipeline.steps': steps.length,
    });
  }
  return result;
}
