'use client';

import { useActionState } from 'react';
import { runAiTestAction, type AiLabState } from './actions';
import type { LLMIntent } from '@/lib/kernel';

const INITIAL: AiLabState = { status: 'idle' };

const INTENT_HINTS: Record<LLMIntent, { system: string; user: string; schema: string }> = {
  caption_hook: {
    system: 'You write punchy TikTok captions under 100 chars with one emoji.',
    user: 'review of the new bluetooth earbuds that block highway noise',
    schema: 'none',
  },
  classify_niche: {
    system:
      'Classify a video into one of: audio_gadgets, skincare, home_kitchen, mobile_accessories, food_recipe, general.',
    user: 'a kitchen blender that makes hot soup in 5 minutes',
    schema: 'niche',
  },
  policy_check: {
    system:
      'You are a TikTok content policy reviewer. Flag any risk categories and assign a numeric risk score from 0 (safe) to 1 (forbidden).',
    user: 'glowing serum that cures all acne overnight, results guaranteed',
    schema: 'policy',
  },
  editorial_rewrite: {
    system: 'Rewrite to be punchier while keeping the meaning. Keep under 280 chars.',
    user: 'these are some pretty good earbuds that i bought yesterday and i think they sound nice',
    schema: 'none',
  },
  tool_loop: {
    system: 'You are a tool-calling planner. Decompose the user task into ordered steps.',
    user: 'find a trending audio clip, generate caption, schedule publish for 9pm',
    schema: 'none',
  },
};

const INTENTS: LLMIntent[] = [
  'caption_hook',
  'classify_niche',
  'policy_check',
  'editorial_rewrite',
  'tool_loop',
];

function fmtCost(cents: number): string {
  if (cents === 0) return '0¢ (free / mock)';
  if (cents < 100) return `${cents}¢`;
  return `$${(cents / 100).toFixed(2)}`;
}

export function AiLabForm({ defaultIntent = 'caption_hook' as LLMIntent }) {
  const [state, formAction, pending] = useActionState(runAiTestAction, INITIAL);
  const hint = INTENT_HINTS[defaultIntent];

  return (
    <div className="space-y-6">
      <form
        action={formAction}
        className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-neutral-400">intent</span>
            <select
              name="intent"
              defaultValue={defaultIntent}
              className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 focus:border-emerald-500 focus:outline-none"
            >
              {INTENTS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-neutral-400">
              JSON schema
            </span>
            <select
              name="schema_kind"
              defaultValue={hint.schema}
              className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 focus:border-emerald-500 focus:outline-none"
            >
              <option value="none">none (plain text)</option>
              <option value="niche">niche {`{niche, confidence}`}</option>
              <option value="policy">policy {`{risk, flags, reasoning}`}</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {pending ? 'Running…' : 'Run'}
            </button>
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">
            system prompt (cached)
          </span>
          <textarea
            name="system"
            rows={3}
            defaultValue={hint.system}
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-200 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">user prompt</span>
          <textarea
            name="user"
            rows={3}
            defaultValue={hint.user}
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-200 focus:border-emerald-500 focus:outline-none"
          />
        </label>
      </form>

      {state.status === 'error' && (
        <div className="rounded-lg border border-rose-700/60 bg-rose-900/20 p-3 text-sm text-rose-300">
          {state.message}
        </div>
      )}

      {state.status === 'success' && state.result && (
        <section className="space-y-3 rounded-lg border border-emerald-800/60 bg-neutral-900/40 p-4">
          <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
            <Stat label="driver" value={state.result.route.driver} />
            <Stat label="model" value={state.result.model} />
            <Stat
              label="cost"
              value={fmtCost(state.result.cost_cents)}
              accent={state.result.cost_cents > 0 ? 'amber' : 'neutral'}
            />
            <Stat label="latency" value={`${state.result.latency_ms} ms`} />
            <Stat label="input tok" value={state.result.usage.input_tokens.toLocaleString()} />
            <Stat
              label="cached in"
              value={state.result.usage.cached_input_tokens.toLocaleString()}
              accent={state.result.usage.cached_input_tokens > 0 ? 'emerald' : 'neutral'}
            />
            <Stat label="output tok" value={state.result.usage.output_tokens.toLocaleString()} />
            <Stat
              label="cache_enabled"
              value={state.result.cache_enabled ? 'yes' : 'no'}
              accent={state.result.cache_enabled ? 'emerald' : 'neutral'}
            />
          </div>

          {state.result.json !== null && state.result.json !== undefined ? (
            <details open className="rounded border border-neutral-800 bg-neutral-950 p-3">
              <summary className="cursor-pointer text-xs uppercase tracking-wider text-neutral-400">
                parsed JSON
              </summary>
              <pre className="mt-2 overflow-x-auto text-xs text-emerald-200">
                {JSON.stringify(state.result.json, null, 2)}
              </pre>
            </details>
          ) : null}

          <details open className="rounded border border-neutral-800 bg-neutral-950 p-3">
            <summary className="cursor-pointer text-xs uppercase tracking-wider text-neutral-400">
              raw text
            </summary>
            <pre className="mt-2 whitespace-pre-wrap text-xs text-neutral-300">
              {state.result.text || '(empty)'}
            </pre>
          </details>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent = 'neutral',
}: {
  label: string;
  value: string;
  accent?: 'neutral' | 'emerald' | 'amber';
}) {
  const colour =
    accent === 'emerald'
      ? 'text-emerald-300'
      : accent === 'amber'
      ? 'text-amber-300'
      : 'text-neutral-200';
  return (
    <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div className={`font-mono text-sm ${colour}`}>{value}</div>
    </div>
  );
}
