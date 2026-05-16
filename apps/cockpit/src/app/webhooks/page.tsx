import { OfflineBanner } from '@/components/offline-banner';
import { listWebhooks } from '@/lib/kernel';
import {
  deleteWebhookAction,
  testWebhookAction,
  toggleWebhookAction,
} from './actions';
import { CreateWebhookForm } from './create-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function fmt(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toISOString().slice(0, 19).replace('T', ' ');
}

function statusColour(s: number | null): string {
  if (s === null) return 'text-neutral-500';
  if (s >= 200 && s < 300) return 'text-emerald-300';
  if (s >= 400) return 'text-rose-300';
  return 'text-amber-300';
}

export default async function WebhooksPage() {
  try {
    const { webhooks, known_schemas } = await listWebhooks();

    return (
      <div className="space-y-8">
        <header>
          <h1 className="text-2xl font-semibold text-neutral-100">Outbound webhooks</h1>
          <p className="text-sm text-neutral-400">
            {webhooks.length} webhook(s). Every event fires HMAC-SHA256 signed POSTs with up to
            3 retries (200ms → 800ms → 2.4s backoff). The signing secret is encrypted at rest
            with the credential key.
          </p>
        </header>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
            Register webhook
          </h2>
          <CreateWebhookForm knownSchemas={known_schemas} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
            Registered webhooks
          </h2>
          <div className="overflow-hidden rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wider text-neutral-400">
                <tr>
                  <th className="px-3 py-2">URL</th>
                  <th className="px-3 py-2">Schemas</th>
                  <th className="px-3 py-2 text-right">Delivered</th>
                  <th className="px-3 py-2 text-right">Failed</th>
                  <th className="px-3 py-2">Last status</th>
                  <th className="px-3 py-2">Last called</th>
                  <th className="px-3 py-2">Enabled</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/70 font-mono text-xs">
                {webhooks.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-4 text-center text-neutral-500">
                      No webhooks registered yet.
                    </td>
                  </tr>
                )}
                {webhooks.map((w) => (
                  <tr key={w.id}>
                    <td className="px-3 py-2 max-w-xs truncate text-neutral-200" title={w.url}>
                      {w.url}
                    </td>
                    <td className="px-3 py-2 text-amber-300">{w.schemas.join(', ')}</td>
                    <td className="px-3 py-2 text-right text-emerald-300">
                      {w.delivered_count}
                    </td>
                    <td className="px-3 py-2 text-right text-rose-300">{w.failed_count}</td>
                    <td className={`px-3 py-2 ${statusColour(w.last_status)}`}>
                      {w.last_status ?? '—'}
                      {w.last_error && (
                        <span
                          className="ml-1 text-neutral-500"
                          title={w.last_error}
                        >
                          ⚠
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-neutral-500">{fmt(w.last_called_at)}</td>
                    <td className="px-3 py-2">
                      <form action={toggleWebhookAction}>
                        <input type="hidden" name="id" value={w.id} />
                        <input type="hidden" name="enabled" value={String(w.enabled)} />
                        <button
                          type="submit"
                          className={`rounded px-2 py-0.5 text-[10px] uppercase ${
                            w.enabled
                              ? 'bg-emerald-700/40 text-emerald-200 hover:bg-emerald-600/40'
                              : 'bg-neutral-700/40 text-neutral-300 hover:bg-neutral-600/40'
                          }`}
                        >
                          {w.enabled ? 'on' : 'off'}
                        </button>
                      </form>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <form action={testWebhookAction} className="inline-block">
                        <input type="hidden" name="id" value={w.id} />
                        <button
                          type="submit"
                          className="mr-1 rounded bg-sky-700/60 px-2 py-1 text-[10px] uppercase text-sky-100 hover:bg-sky-600"
                        >
                          Test
                        </button>
                      </form>
                      <form action={deleteWebhookAction} className="inline-block">
                        <input type="hidden" name="id" value={w.id} />
                        <button
                          type="submit"
                          className="rounded bg-rose-800/60 px-2 py-1 text-[10px] uppercase text-rose-100 hover:bg-rose-700"
                        >
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  } catch (err) {
    return <OfflineBanner error={err} />;
  }
}
