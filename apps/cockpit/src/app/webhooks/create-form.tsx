'use client';

import { useActionState } from 'react';
import { createWebhookAction, type CreateWebhookState } from './actions';

const INITIAL: CreateWebhookState = { status: 'idle' };

interface Props {
  knownSchemas: readonly string[];
}

export function CreateWebhookForm({ knownSchemas }: Props) {
  const [state, formAction, pending] = useActionState(createWebhookAction, INITIAL);

  return (
    <div className="space-y-3">
      <form
        action={formAction}
        className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4"
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-neutral-400">
            destination URL (http or https)
          </span>
          <input
            name="url"
            type="url"
            required
            placeholder="https://example.com/vfos-hook"
            className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs uppercase tracking-wider text-neutral-400">
            event schemas
          </legend>
          <div className="flex flex-wrap gap-3 rounded border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs">
            <label className="flex items-center gap-1 font-mono">
              <input
                type="checkbox"
                name="schemas"
                value="*"
                className="accent-emerald-500"
              />
              <span className="text-amber-300">* (all events)</span>
            </label>
            {knownSchemas.map((s) => (
              <label key={s} className="flex items-center gap-1 font-mono">
                <input
                  type="checkbox"
                  name="schemas"
                  value={s}
                  defaultChecked={s === 'publish.completed.v1' || s === 'compliance.decision.v1'}
                  className="accent-emerald-500"
                />
                <span className="text-neutral-300">{s}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={pending}
          className="self-start rounded bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {pending ? 'Registering…' : 'Register webhook'}
        </button>
      </form>

      {state.status === 'error' && (
        <div className="rounded-lg border border-rose-700/60 bg-rose-900/20 p-3 text-sm text-rose-300">
          {state.message}
        </div>
      )}

      {state.status === 'success' && state.webhook && state.secret && (
        <div className="space-y-2 rounded-lg border border-amber-700/60 bg-amber-900/20 p-4">
          <div className="text-sm font-semibold text-amber-300">
            ⚠ Copy this signing secret now — it is shown ONCE
          </div>
          <div className="text-xs text-neutral-300">
            <code className="font-mono">{state.webhook.url}</code> · schemas:{' '}
            {state.webhook.schemas.join(', ')}
          </div>
          <code className="block break-all rounded bg-neutral-950 px-3 py-2 font-mono text-xs text-emerald-300">
            {state.secret}
          </code>
          <div className="text-[11px] text-neutral-400">
            Verify each delivery on your end:{' '}
            <code className="font-mono">
              HMAC-SHA256(secret, raw_body) === request.headers[&apos;x-vfos-signature&apos;].slice(7)
            </code>
          </div>
        </div>
      )}
    </div>
  );
}
