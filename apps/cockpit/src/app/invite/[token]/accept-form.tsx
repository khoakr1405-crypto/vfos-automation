'use client';

import { useActionState } from 'react';
import { acceptInviteAction, type AcceptInviteState } from './actions';

interface Props {
  token: string;
  pinnedEmail: string | null;
  isAdmin: boolean;
  scopes: readonly string[];
}

const INITIAL: AcceptInviteState = { status: 'idle' };

export function AcceptInviteForm({ token, pinnedEmail, isAdmin, scopes }: Props) {
  const [state, formAction, pending] = useActionState(acceptInviteAction, INITIAL);

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-6"
    >
      <input type="hidden" name="token" value={token} />
      <h1 className="text-lg font-semibold text-neutral-100">
        {isAdmin ? 'Accept admin invite' : 'Accept invite'}
      </h1>
      <div className="text-xs text-neutral-400">
        {isAdmin
          ? 'This invite grants full platform admin (scope *).'
          : `Scopes: ${scopes.join(', ') || '(none)'}`}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wider text-neutral-400">email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={pinnedEmail ?? ''}
          readOnly={Boolean(pinnedEmail)}
          className="rounded border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-sm text-neutral-200 read-only:opacity-70 focus:border-emerald-500 focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wider text-neutral-400">password</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-sm text-neutral-200 focus:border-emerald-500 focus:outline-none"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Accept and sign in'}
      </button>

      {state.status === 'error' && (
        <div className="rounded border border-rose-700/60 bg-rose-900/20 p-2 text-sm text-rose-300">
          {state.message}
        </div>
      )}
    </form>
  );
}
