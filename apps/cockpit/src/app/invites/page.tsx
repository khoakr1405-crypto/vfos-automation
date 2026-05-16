import { OfflineBanner } from '@/components/offline-banner';
import { listInvites, listTenants } from '@/lib/kernel';
import { revokeInviteAction } from './actions';
import { CreateInviteForm } from './create-invite-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function fmt(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toISOString().slice(0, 19).replace('T', ' ');
}

export default async function InvitesPage() {
  try {
    const [{ invites }, { tenants }] = await Promise.all([listInvites(false), listTenants()]);

    return (
      <div className="space-y-8">
        <header>
          <h1 className="text-2xl font-semibold text-neutral-100">Signup invites</h1>
          <p className="text-sm text-neutral-400">
            {invites.length} pending invite(s). Each invite is single-use; once a recipient
            accepts, the token is locked and the user gets a session token.
          </p>
        </header>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
            Mint new invite
          </h2>
          <CreateInviteForm tenants={tenants.map((t) => ({ id: t.id, slug: t.slug }))} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
            Pending invites
          </h2>
          <div className="overflow-hidden rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wider text-neutral-400">
                <tr>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Scopes</th>
                  <th className="px-4 py-2">Admin?</th>
                  <th className="px-4 py-2">Expires</th>
                  <th className="px-4 py-2">Token</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/70 font-mono text-xs">
                {invites.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-4 text-center text-neutral-500">
                      No pending invites — mint one above.
                    </td>
                  </tr>
                )}
                {invites.map((i) => (
                  <tr key={i.token}>
                    <td className="px-4 py-2 text-neutral-200">{i.email ?? '(any)'}</td>
                    <td className="px-4 py-2 text-amber-300">
                      {i.scopes.join(', ') || '(none)'}
                    </td>
                    <td className="px-4 py-2 text-neutral-300">{i.is_admin ? 'yes' : 'no'}</td>
                    <td className="px-4 py-2 text-neutral-500">{fmt(i.expires_at)}</td>
                    <td className="px-4 py-2 text-neutral-400 truncate" title={i.token}>
                      {i.token.slice(0, 18)}…
                    </td>
                    <td className="px-4 py-2 text-right">
                      <form action={revokeInviteAction}>
                        <input type="hidden" name="token" value={i.token} />
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
