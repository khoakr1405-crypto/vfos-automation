import { revalidatePath } from 'next/cache';
import { OfflineBanner } from '@/components/offline-banner';
import { createTenant, listTenants } from '@/lib/kernel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function createTenantAction(formData: FormData): Promise<void> {
  'use server';
  const slug = String(formData.get('slug') ?? '').trim();
  const tier = String(formData.get('tier') ?? 'solo');
  if (!slug) return;
  await createTenant({ slug, tier });
  revalidatePath('/tenants');
}

const TIER_BADGE: Record<string, string> = {
  solo: 'bg-neutral-700/40 text-neutral-200',
  pro: 'bg-sky-700/40 text-sky-200',
  agency: 'bg-amber-700/40 text-amber-200',
};

export default async function TenantsPage() {
  try {
    const { tenants } = await listTenants();
    return (
      <div className="space-y-8">
        <header>
          <h1 className="text-2xl font-semibold text-neutral-100">Tenants</h1>
          <p className="text-sm text-neutral-400">
            {tenants.length} tenant(s). RLS-isolated via{' '}
            <code className="font-mono">SET LOCAL app.tenant_id</code> + non-superuser
            role <code className="font-mono">vfos_app</code>.
          </p>
        </header>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
            Create tenant
          </h2>
          <form
            action={createTenantAction}
            className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4"
          >
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wider text-neutral-400">slug</span>
              <input
                name="slug"
                required
                pattern="[a-z0-9][a-z0-9-]{1,62}[a-z0-9]"
                placeholder="acme-media"
                className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wider text-neutral-400">tier</span>
              <select
                name="tier"
                defaultValue="solo"
                className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-200 focus:border-emerald-500 focus:outline-none"
              >
                <option value="solo">solo</option>
                <option value="pro">pro</option>
                <option value="agency">agency</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500"
            >
              Create
            </button>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
            Existing tenants
          </h2>
          <div className="overflow-hidden rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wider text-neutral-400">
                <tr>
                  <th className="px-4 py-2">Slug</th>
                  <th className="px-4 py-2">Tier</th>
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2 text-right">Videos/day</th>
                  <th className="px-4 py-2 text-right">Budget USD/day</th>
                  <th className="px-4 py-2 text-right">Accounts max</th>
                  <th className="px-4 py-2 text-right">Syscalls/min</th>
                  <th className="px-4 py-2">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/70 font-mono text-xs">
                {tenants.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2 text-neutral-200">{t.slug}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] uppercase ${
                          TIER_BADGE[t.tier] ?? 'bg-neutral-700/40 text-neutral-200'
                        }`}
                      >
                        {t.tier}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-neutral-500">{t.id}</td>
                    <td className="px-4 py-2 text-right text-neutral-300">
                      {t.videos_per_day ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-300">
                      {t.budget_usd_per_day ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-300">
                      {t.accounts_max ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-300">
                      {t.syscalls_per_minute ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-neutral-500">
                      {new Date(t.created_at).toISOString().slice(0, 19).replace('T', ' ')}
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
