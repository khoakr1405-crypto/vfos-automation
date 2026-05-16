'use client';

import { useActionState } from 'react';
import { linkConnectorAction, type LinkConnectorState } from './actions';

interface Props {
  platforms: { platform: string; mode: 'mock' | 'live' }[];
}

const INITIAL: LinkConnectorState = { status: 'idle' };

export function LinkConnectorForm({ platforms }: Props) {
  const [state, formAction, pending] = useActionState(linkConnectorAction, INITIAL);

  return (
    <div className="space-y-3">
      <form
        action={formAction}
        className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 md:grid-cols-2"
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">platform</span>
          <select
            name="platform"
            required
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 focus:border-emerald-500 focus:outline-none"
          >
            {platforms.map((p) => (
              <option key={p.platform} value={p.platform}>
                {p.platform} ({p.mode})
              </option>
            ))}
            {platforms.length === 0 && <option value="tiktok">tiktok</option>}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">account_id</span>
          <input
            name="account_id"
            required
            placeholder="123456789 or page id"
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">handle (optional)</span>
          <input
            name="handle"
            placeholder="@username"
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">
            scopes (comma-separated)
          </span>
          <input
            name="scopes"
            placeholder="video.publish, video.upload"
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-xs uppercase tracking-wider text-neutral-400">
            access_token (stored AES-256-GCM encrypted)
          </span>
          <input
            name="access_token"
            required
            type="password"
            placeholder="paste OAuth access token"
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">
            refresh_token (optional)
          </span>
          <input
            name="refresh_token"
            type="password"
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">
            expires_at (optional, ISO)
          </span>
          <input
            name="expires_at"
            placeholder="2026-12-31T00:00:00Z"
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {pending ? 'Linking…' : 'Link account'}
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
