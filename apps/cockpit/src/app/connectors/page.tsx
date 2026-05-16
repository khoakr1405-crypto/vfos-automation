import { OfflineBanner } from '@/components/offline-banner';
import {
  getConnectors,
  getOAuthProviders,
  listConnectorCredentials,
} from '@/lib/kernel';
import { startOAuthAction, unlinkConnectorAction } from './actions';
import { LinkConnectorForm } from './link-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function fmt(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toISOString().slice(0, 19).replace('T', ' ');
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ConnectorsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const status = typeof sp.status === 'string' ? sp.status : null;
  const platformQ = typeof sp.platform === 'string' ? sp.platform : null;
  const accountQ = typeof sp.account === 'string' ? sp.account : null;
  const reasonQ = typeof sp.reason === 'string' ? sp.reason : null;

  try {
    const [{ connectors }, { credentials }, { providers }] = await Promise.all([
      getConnectors(),
      listConnectorCredentials(),
      getOAuthProviders(),
    ]);
    const providerByPlatform = new Map(providers.map((p) => [p.platform, p]));

    return (
      <div className="space-y-8">
        <header>
          <h1 className="text-2xl font-semibold text-neutral-100">Platform Connectors</h1>
          <p className="text-sm text-neutral-400">
            {connectors.length} connector(s) registered, {credentials.length} active credential(s).
            Access tokens are encrypted at rest (AES-256-GCM) and never returned via API.
          </p>
        </header>

        {status === 'linked' && (
          <div className="rounded-lg border border-emerald-700/60 bg-emerald-900/20 p-3 text-sm text-emerald-300">
            ✓ Linked {platformQ} account <code className="font-mono">{accountQ}</code> via OAuth.
          </div>
        )}
        {status === 'failed' && (
          <div className="rounded-lg border border-rose-700/60 bg-rose-900/20 p-3 text-sm text-rose-300">
            OAuth flow failed for {platformQ}: <code className="font-mono">{reasonQ}</code>
          </div>
        )}

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
            Available connectors
          </h2>
          <div className="flex flex-wrap gap-2">
            {connectors.map((c) => (
              <span
                key={c.platform}
                className="rounded border border-neutral-800 bg-neutral-900/60 px-3 py-1 font-mono text-xs"
              >
                <span className="text-emerald-300">{c.platform}</span>
                <span className="text-neutral-500"> · publish={c.mode}</span>
                {providerByPlatform.has(c.platform) && (
                  <span className="text-neutral-500">
                    {' '}
                    · oauth={providerByPlatform.get(c.platform)!.mode}
                  </span>
                )}
              </span>
            ))}
            {connectors.length === 0 && (
              <span className="text-xs text-neutral-500">No connectors registered.</span>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
            Connect via OAuth
          </h2>
          <div className="flex flex-wrap gap-3">
            {providers.map((p) => (
              <form key={p.platform} action={startOAuthAction}>
                <input type="hidden" name="platform" value={p.platform} />
                <button
                  type="submit"
                  className="rounded border border-emerald-700/60 bg-emerald-900/20 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-800/30"
                >
                  Connect {p.platform}{' '}
                  <span className="text-xs text-emerald-400/80">({p.mode})</span>
                </button>
              </form>
            ))}
            {providers.length === 0 && (
              <span className="text-xs text-neutral-500">
                No OAuth providers registered.
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Mock mode short-circuits the round-trip and mints a fake credential locally;
            live mode redirects to the real OAuth provider and stores the returned token.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
            Link manually (paste token)
          </h2>
          <LinkConnectorForm platforms={connectors.map((c) => ({ platform: c.platform, mode: c.mode }))} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
            Active credentials
          </h2>
          <div className="overflow-hidden rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wider text-neutral-400">
                <tr>
                  <th className="px-4 py-2">Platform</th>
                  <th className="px-4 py-2">Account</th>
                  <th className="px-4 py-2">Handle</th>
                  <th className="px-4 py-2">Scopes</th>
                  <th className="px-4 py-2">Refresh?</th>
                  <th className="px-4 py-2">Last used</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/70 font-mono text-xs">
                {credentials.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-4 text-center text-neutral-500">
                      No accounts linked yet — paste an OAuth access token above to bind one.
                    </td>
                  </tr>
                )}
                {credentials.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2 text-emerald-300">{c.platform}</td>
                    <td className="px-4 py-2 text-neutral-200">{c.account_id}</td>
                    <td className="px-4 py-2 text-neutral-400">{c.handle ?? '—'}</td>
                    <td className="px-4 py-2 text-amber-300">
                      {c.scopes.join(', ') || '(none)'}
                    </td>
                    <td className="px-4 py-2 text-neutral-400">
                      {c.has_refresh_token ? 'yes' : 'no'}
                    </td>
                    <td className="px-4 py-2 text-neutral-500">{fmt(c.last_used_at)}</td>
                    <td className="px-4 py-2 text-right">
                      <form action={unlinkConnectorAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <button
                          type="submit"
                          className="rounded bg-rose-800/60 px-3 py-1 text-xs font-medium text-rose-100 transition hover:bg-rose-700"
                        >
                          Unlink
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
