import { OfflineBanner } from '@/components/offline-banner';
import { listApiTokens, listTenants } from '@/lib/kernel';
import { revokeTokenAction } from './actions';
import { CreateTokenForm } from './create-token-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function fmt(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toISOString().slice(0, 19).replace('T', ' ');
}

function tenantLabel(
  tenant_id: string | null,
  byId: Map<string, string>,
): string {
  if (!tenant_id) return '(admin / global)';
  return byId.get(tenant_id) ?? tenant_id.slice(0, 8);
}

export default async function TokensPage() {
  try {
    const [{ tokens }, { tenants }] = await Promise.all([
      listApiTokens(),
      listTenants(),
    ]);
    const byId = new Map(tenants.map((t) => [t.id, t.slug]));

    return (
      <div className="space-y-8">
        <header>
          <h1 className="text-2xl font-semibold text-neutral-100">API Tokens</h1>
          <p className="text-sm text-neutral-400">
            {tokens.length} active token(s). Authentication uses{' '}
            <code className="font-mono">Authorization: Bearer vfos_…</code>; only SHA-256 hashes
            are stored.
          </p>
        </header>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
            Mint new token
          </h2>
          <CreateTokenForm tenants={tenants.map((t) => ({ id: t.id, slug: t.slug }))} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
            Active tokens
          </h2>
          <div className="overflow-hidden rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wider text-neutral-400">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Tenant</th>
                  <th className="px-4 py-2">Scopes</th>
                  <th className="px-4 py-2">Created</th>
                  <th className="px-4 py-2">Last used</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/70 font-mono text-xs">
                {tokens.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-4 text-center text-neutral-500">
                      No active tokens — mint one above to authenticate API clients.
                    </td>
                  </tr>
                )}
                {tokens.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2 text-neutral-200">{t.name}</td>
                    <td className="px-4 py-2 text-neutral-300">
                      {tenantLabel(t.tenant_id, byId)}
                    </td>
                    <td className="px-4 py-2 text-amber-300">
                      {t.scopes.join(', ') || '(none)'}
                    </td>
                    <td className="px-4 py-2 text-neutral-500">{fmt(t.created_at)}</td>
                    <td className="px-4 py-2 text-neutral-500">{fmt(t.last_used_at)}</td>
                    <td className="px-4 py-2 text-right">
                      <form action={revokeTokenAction}>
                        <input type="hidden" name="id" value={t.id} />
                        <button
                          type="submit"
                          className="rounded bg-rose-800/60 px-3 py-1 text-xs font-medium text-rose-100 transition hover:bg-rose-700"
                        >
                          Revoke
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
