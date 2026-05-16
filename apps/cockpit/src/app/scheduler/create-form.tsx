'use client';

import { useActionState } from 'react';
import { createScheduleAction, type CreateScheduleState } from './actions';

const INITIAL: CreateScheduleState = { status: 'idle' };

const PRESETS: { label: string; cron: string }[] = [
  { label: 'Every 4 hours', cron: '0 */4 * * *' },
  { label: 'Daily 09:00 UTC', cron: '0 9 * * *' },
  { label: 'Daily 09:00 + 18:00 UTC', cron: '0 9,18 * * *' },
  { label: 'Weekday 12:00 UTC', cron: '0 12 * * 1-5' },
  { label: 'Every 15 min', cron: '*/15 * * * *' },
];

export function CreateScheduleForm() {
  const [state, formAction, pending] = useActionState(createScheduleAction, INITIAL);

  return (
    <div className="space-y-3">
      <form
        action={formAction}
        className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 md:grid-cols-2"
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">name</span>
          <input
            name="name"
            required
            placeholder="morning earbuds drop"
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">
            cron expression (UTC)
          </span>
          <input
            name="cron_expr"
            required
            defaultValue="0 9 * * *"
            list="cron-presets"
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 focus:border-emerald-500 focus:outline-none"
          />
          <datalist id="cron-presets">
            {PRESETS.map((p) => (
              <option key={p.cron} value={p.cron}>
                {p.label}
              </option>
            ))}
          </datalist>
          <span className="text-[10px] text-neutral-500">
            5 fields: min hour day-of-month month day-of-week. Supports * N N-M */N N,M.
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">
            target platform
          </span>
          <select
            name="target_platform"
            defaultValue="tiktok"
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 focus:border-emerald-500 focus:outline-none"
          >
            <option value="tiktok">tiktok</option>
            <option value="facebook">facebook</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">caption</span>
          <input
            name="caption"
            defaultValue="scheduled drop 🎬 #affiliate"
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-xs uppercase tracking-wider text-neutral-400">
            source URL (optional)
          </span>
          <input
            name="source_url"
            type="url"
            placeholder="https://www.tiktok.com/@..."
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {pending ? 'Creating…' : 'Schedule pipeline'}
          </button>
        </div>
      </form>

      {state.status === 'error' && (
        <div className="rounded-lg border border-rose-700/60 bg-rose-900/20 p-3 text-sm text-rose-300">
          {state.message}
        </div>
      )}
      {state.status === 'success' && (
        <div className="rounded-lg border border-emerald-700/60 bg-emerald-900/20 p-3 text-sm text-emerald-300">
          {state.message}
        </div>
      )}
    </div>
  );
}
