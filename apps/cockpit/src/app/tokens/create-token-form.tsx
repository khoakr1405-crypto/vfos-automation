'use client';

import { useActionState } from 'react';
import { createTokenAction, type CreateTokenState } from './actions';

interface Props {
  tenants: { id: string; slug: string }[];
}

const INITIAL: CreateTokenState = { status: 'idle' };

export function CreateTokenForm({ tenants }: Props) {
  const [state, formAction, pending] = useActionState(createTokenAction, INITIAL);

  return (
    <div className="space-y-4">
      <form
        action={formAction}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4"
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">name</span>
          <input
            name="name"
            required
            placeholder="ci-pipeline"
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">tenant</span>
          <select
            name="tenant_id"
            defaultValue=""
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 focus:border-emerald-500 focus:outline-none"
          >
            <option value="">(admin / no tenant)</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.slug}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[260px] flex-1 flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">
            scopes (comma-separated, or * for admin)
          </span>
          <input
            name="scopes"
            placeholder="fs.read, fs.write, ai.complete"
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Mint token'}
        </button>
      </form>

      {state.status === 'error' && (
        <div className="rounded-lg border border-rose-700/60 bg-rose-900/20 p-3 text-sm text-rose-300">
          {state.message}
        </div>
      )}

      {state.status === 'success' && state.rawToken && (
        <div className="space-y-2 rounded-lg border border-amber-700/60 bg-amber-900/20 p-4">
          <div className="text-sm font-semibold text-amber-300">⚠ Copy this token now</div>
          <div className="text-xs text-neutral-300">
            <code className="font-mono">{state.name}</code> — the raw token is shown ONCE. Only its
            hash is stored in the database; refreshing this page will hide it forever.
          </div>
          <code className="block break-all rounded bg-neutral-950 px-3 py-2 font-mono text-xs text-emerald-300">
            {state.rawToken}
          </code>
        </div>
      )}
    </div>
  );
}
