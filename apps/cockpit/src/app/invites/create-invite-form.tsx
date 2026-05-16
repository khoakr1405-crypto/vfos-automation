'use client';

import { useActionState } from 'react';
import { createInviteAction, type CreateInviteState } from './actions';

const INITIAL: CreateInviteState = { status: 'idle' };

interface Props {
  tenants: { id: string; slug: string }[];
}

export function CreateInviteForm({ tenants }: Props) {
  const [state, formAction, pending] = useActionState(createInviteAction, INITIAL);

  const inviteUrl =
    state.status === 'success' && state.invite
      ? `${(typeof window !== 'undefined' ? window.location.origin : state.cockpitOrigin) ?? ''}/invite/${state.invite.token}`
      : null;

  return (
    <div className="space-y-3">
      <form
        action={formAction}
        className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 md:grid-cols-2"
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">
            email (optional, pins invite to this email)
          </span>
          <input
            name="email"
            type="email"
            placeholder="alice@example.com"
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
            <option value="">(default tenant)</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.slug}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-xs uppercase tracking-wider text-neutral-400">
            scopes (comma-separated; ignored when is_admin)
          </span>
          <input
            name="scopes"
            placeholder="fs.read, fs.write, ai.complete, publish.write"
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="flex items-center gap-2">
          <input name="is_admin" type="checkbox" className="accent-emerald-500" />
          <span className="text-xs uppercase tracking-wider text-neutral-400">
            grant admin (scope &quot;*&quot;)
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">
            TTL hours (max 720)
          </span>
          <input
            name="ttl_hours"
            type="number"
            min="1"
            max="720"
            defaultValue="168"
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {pending ? 'Minting…' : 'Mint invite'}
          </button>
        </div>
      </form>

      {state.status === 'error' && (
        <div className="rounded-lg border border-rose-700/60 bg-rose-900/20 p-3 text-sm text-rose-300">
          {state.message}
        </div>
      )}

      {state.status === 'success' && state.invite && inviteUrl && (
        <div className="space-y-2 rounded-lg border border-amber-700/60 bg-amber-900/20 p-4">
          <div className="text-sm font-semibold text-amber-300">
            ⚠ Copy this invite URL — it is shown ONCE
          </div>
          <div className="text-xs text-neutral-300">
            For {state.invite.email ?? 'any email'} · expires{' '}
            <code className="font-mono">{state.invite.expires_at.slice(0, 19)}</code> ·{' '}
            {state.invite.is_admin ? 'admin (*)' : `scopes: ${state.invite.scopes.join(', ') || '(none)'}`}
          </div>
          <code className="block break-all rounded bg-neutral-950 px-3 py-2 font-mono text-xs text-emerald-300">
            {inviteUrl}
          </code>
        </div>
      )}
    </div>
  );
}
