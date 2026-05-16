'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { runPipelineAction, type RunPipelineState } from './actions';
import type { PipelineStep } from '@/lib/kernel';

const INITIAL: RunPipelineState = { status: 'idle' };

interface Props {
  hasTiktokCred: boolean;
  hasFacebookCred: boolean;
}

const STATUS_COLOUR: Record<PipelineStep['status'], string> = {
  ok: 'text-emerald-300',
  failed: 'text-rose-300',
  skipped: 'text-neutral-500',
};

const STATUS_GLYPH: Record<PipelineStep['status'], string> = {
  ok: '✓',
  failed: '✗',
  skipped: '—',
};

const FINAL_COLOUR: Record<NonNullable<RunPipelineState['result']>['final'], string> = {
  published: 'text-emerald-300',
  partial: 'text-amber-300',
  rejected_compliance: 'text-amber-300',
  no_connector: 'text-amber-300',
  render_timeout: 'text-rose-300',
  failed: 'text-rose-300',
};

const PUBLISH_STATUS_COLOUR: Record<'published' | 'skipped' | 'failed', string> = {
  published: 'text-emerald-300',
  skipped: 'text-neutral-500',
  failed: 'text-rose-300',
};

export function PipelineForm({ hasTiktokCred, hasFacebookCred }: Props) {
  const [state, formAction, pending] = useActionState(runPipelineAction, INITIAL);

  return (
    <div className="space-y-4">
      <form
        action={formAction}
        className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 md:grid-cols-2"
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">source URL</span>
          <input
            name="source_url"
            type="url"
            defaultValue="https://www.tiktok.com/@demo/video/1001"
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <fieldset className="flex flex-col gap-1">
          <legend className="text-xs uppercase tracking-wider text-neutral-400">
            target platforms (fan-out)
          </legend>
          <div className="flex flex-wrap items-center gap-3 rounded border border-neutral-800 bg-neutral-950 px-3 py-2">
            <label className="flex items-center gap-2 font-mono text-sm">
              <input
                type="checkbox"
                name="target_platforms"
                value="tiktok"
                defaultChecked={hasTiktokCred}
                className="accent-emerald-500"
              />
              <span className={hasTiktokCred ? 'text-neutral-200' : 'text-neutral-500'}>
                tiktok {hasTiktokCred ? '✓' : '(no cred)'}
              </span>
            </label>
            <label className="flex items-center gap-2 font-mono text-sm">
              <input
                type="checkbox"
                name="target_platforms"
                value="facebook"
                defaultChecked={hasFacebookCred}
                className="accent-emerald-500"
              />
              <span className={hasFacebookCred ? 'text-neutral-200' : 'text-neutral-500'}>
                facebook {hasFacebookCred ? '✓' : '(no cred)'}
              </span>
            </label>
          </div>
        </fieldset>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">niche hint</span>
          <input
            name="niche_hint"
            defaultValue="audio_gadgets"
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">caption</span>
          <input
            name="caption"
            defaultValue="honest review of these earbuds 🎧 #affiliate"
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-xs uppercase tracking-wider text-neutral-400">
            transcript (used by policy.check)
          </span>
          <textarea
            name="transcript"
            rows={2}
            defaultValue="short review of the new wireless earbuds — sound clear, mids warm, battery decent for the price"
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-200 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {pending ? 'Running pipeline…' : 'Run pipeline →'}
          </button>
        </div>
      </form>

      {state.status === 'error' && (
        <div className="rounded-lg border border-rose-700/60 bg-rose-900/20 p-3 text-sm text-rose-300">
          {state.message}
        </div>
      )}

      {state.status === 'success' && state.result && (
        <section className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <span
              className={`font-mono text-lg font-semibold ${FINAL_COLOUR[state.result.final]}`}
            >
              {state.result.final}
            </span>
            <span className="font-mono text-xs text-neutral-400">
              total {state.result.total_ms}ms
            </span>
            <Link
              href={`/traces/${state.result.trace_id}`}
              className="text-xs text-sky-400 underline hover:text-sky-300"
            >
              view trace ↗
            </Link>
            {state.result.reason && (
              <span className="font-mono text-xs text-neutral-500">{state.result.reason}</span>
            )}
          </div>

          <ol className="divide-y divide-neutral-800/70 rounded border border-neutral-800">
            {state.result.steps.map((s, i) => (
              <li
                key={`${i}:${s.name}`}
                className="grid grid-cols-12 gap-2 px-3 py-2 text-xs"
              >
                <span className={`col-span-1 font-mono ${STATUS_COLOUR[s.status]}`}>
                  {STATUS_GLYPH[s.status]}
                </span>
                <span className="col-span-5 font-mono text-neutral-200">{s.name}</span>
                <span className="col-span-2 text-right font-mono text-neutral-500">
                  {s.ms}ms
                </span>
                <span className="col-span-4 truncate font-mono text-neutral-400">
                  {s.error
                    ? s.error
                    : s.output
                    ? summarize(s.name, s.output)
                    : '(no output)'}
                </span>
              </li>
            ))}
          </ol>

          {state.result.publishes && state.result.publishes.length > 1 && (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wider text-neutral-400">
                fan-out summary
              </div>
              <ul className="divide-y divide-neutral-800/70 rounded border border-neutral-800">
                {state.result.publishes.map((p) => (
                  <li
                    key={p.platform}
                    className="grid grid-cols-12 gap-2 px-3 py-2 text-xs"
                  >
                    <span className="col-span-2 font-mono text-emerald-300">{p.platform}</span>
                    <span
                      className={`col-span-2 font-mono ${PUBLISH_STATUS_COLOUR[p.status]}`}
                    >
                      {p.status}
                    </span>
                    <span className="col-span-3 font-mono text-neutral-400">
                      {p.account_id ? `@${p.account_id.slice(0, 18)}` : '—'}
                    </span>
                    <span className="col-span-5 truncate font-mono text-neutral-300">
                      {p.url ?? p.publish_id ?? p.error ?? '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function summarize(name: string, out: Record<string, unknown>): string {
  switch (name) {
    case 'trend.score':
      return `score=${(out.score as number)?.toFixed?.(1) ?? '?'}`;
    case 'ai.classify_niche':
      return `niche=${(out.json as { niche?: string } | undefined)?.niche ?? '?'}`;
    case 'fs.put':
      return `asset=${(out.asset_id as string | undefined)?.slice(0, 14) ?? '?'} (${out.bytes ?? '?'}B)`;
    case 'compliance.gate':
      return `decision=${out.decision} ${out.layer ? `layer=${out.layer}` : ''}`;
    case 'queue.enqueue render':
      return `job=${(out.job_id as string | undefined)?.slice(0, 16) ?? '?'}`;
    case 'await render.completed':
      return `render_ms=${out.render_ms ?? '?'}`;
    case 'connectors.list':
      return `accounts=${(out.credentials as unknown[] | undefined)?.length ?? '?'}`;
    case 'publish.tiktok':
    case 'publish.facebook.reels':
      return `publish_id=${(out.publish_id as string | undefined)?.slice(0, 18) ?? '?'} ${out.status ?? ''}`;
    default:
      return JSON.stringify(out).slice(0, 60);
  }
}
