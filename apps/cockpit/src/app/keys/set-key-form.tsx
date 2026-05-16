'use client';

import { useActionState } from 'react';
import { setKeyAction, type SetKeyState } from './actions';

const INITIAL: SetKeyState = { status: 'idle' };

interface Props {
  supportedProviders: readonly string[];
}

export function SetKeyForm({ supportedProviders }: Props) {
  const [state, formAction, pending] = useActionState(setKeyAction, INITIAL);
  return (
    <div className="space-y-3">
      <form
        action={formAction}
        className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4"
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">provider</span>
          <select
            name="provider"
            required
            defaultValue={supportedProviders[0] ?? 'anthropic'}
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 focus:border-emerald-500 focus:outline-none"
          >
            {supportedProviders.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">
            api key (stored encrypted; shown ONCE here)
          </span>
          <input
            name="api_key"
            type="password"
            required
            minLength={8}
            autoComplete="off"
            placeholder="sk-ant-..."
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">
            label (optional)
          </span>
          <input
            name="label"
            type="text"
            maxLength={80}
            placeholder="e.g. prod, billing-account-A"
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save key'}
        </button>
      </form>

      {state.status === 'error' && (
        <div className="rounded-lg border border-rose-700/60 bg-rose-900/20 p-3 text-sm text-rose-300">
          {state.message}
        </div>
      )}
      {state.status === 'success' && (
        <div className="rounded-lg border border-emerald-700/60 bg-emerald-900/20 p-3 text-sm text-emerald-200">
          {state.message}
        </div>
      )}
    </div>
  );
}
