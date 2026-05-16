import { OfflineBanner } from '@/components/offline-banner';
import { listTenantKeys } from '@/lib/kernel';
import { revokeKeyAction } from './actions';
import { SetKeyForm } from './set-key-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function fmt(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toISOString().slice(0, 19).replace('T', ' ');
}

export default async function KeysPage() {
  try {
    const { keys, supported_providers } = await listTenantKeys();
    const activeCount = keys.filter((k) => k.active).length;
    return (
      <div className="space-y-8">
        <header>
          <h1 className="text-2xl font-semibold text-neutral-100">Tenant LLM API keys</h1>
          <p className="text-sm text-neutral-400">
            {activeCount} active key(s) · supported providers:{' '}
            <span className="font-mono text-amber-300">
              {supported_providers.join(', ')}
            </span>
            . When a key is set the router uses it for this tenant's LLM calls; the plaintext is
            encrypted at rest with the credential key and never returned by the API.
          </p>
        </header>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
            Register / rotate key
          </h2>
          <SetKeyForm supportedProviders={supported_providers} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
            Stored keys
          </h2>
          <div className="overflow-hidden rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wider text-neutral-400">
                <tr>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Label</th>
                  <th className="px-3 py-2">Last 4</th>
                  <th className="px-3 py-2">Fingerprint</th>
                  <th className="px-3 py-2">Active</th>
                  <th className="px-3 py-2">Updated</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/70 font-mono text-xs">
                {keys.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-4 text-center text-neutral-500">
                      No tenant-scoped keys yet. The kernel uses its global API key for this
                      tenant.
                    </td>
                  </tr>
                )}
                {keys.map((k) => (
                  <tr key={k.provider}>
                    <td className="px-3 py-2 text-amber-300">{k.provider}</td>
                    <td className="px-3 py-2 text-neutral-300">{k.label ?? '—'}</td>
                    <td className="px-3 py-2 text-neutral-200">…{k.last4}</td>
                    <td className="px-3 py-2 max-w-xs truncate text-neutral-500" title={k.fingerprint}>
                      {k.fingerprint}
                    </td>
                    <td className="px-3 py-2">
                      {k.active ? (
                        <span className="rounded bg-emerald-700/40 px-2 py-0.5 text-[10px] uppercase text-emerald-200">
                          active
                        </span>
                      ) : (
                        <span className="rounded bg-neutral-700/40 px-2 py-0.5 text-[10px] uppercase text-neutral-300">
                          revoked {fmt(k.revoked_at)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-neutral-500">{fmt(k.updated_at)}</td>
                    <td className="px-3 py-2 text-right">
                      {k.active && (
                        <form action={revokeKeyAction} className="inline-block">
                          <input type="hidden" name="provider" value={k.provider} />
                          <button
                            type="submit"
                            className="rounded bg-rose-800/60 px-2 py-1 text-[10px] uppercase text-rose-100 hover:bg-rose-700"
                          >
                            Revoke
                          </button>
                        </form>
                      )}
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
