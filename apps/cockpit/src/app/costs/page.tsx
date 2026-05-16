import { OfflineBanner } from '@/components/offline-banner';
import { getCostSummary, getTopTenantsToday } from '@/lib/kernel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function CostsPage() {
  try {
    const [summary, top] = await Promise.all([
      getCostSummary(30),
      // Top view is admin-only — fall back to null if the caller is a
      // tenant token without `tenant.admin`.
      getTopTenantsToday(25).catch(() => null),
    ]);
    const todayRow = summary.rows[0];
    return (
      <div className="space-y-8">
        <header>
          <h1 className="text-2xl font-semibold text-neutral-100">LLM costs</h1>
          <p className="text-sm text-neutral-400">
            Total {usd(summary.total_cents)} across {summary.total_calls} call(s) in the last{' '}
            {summary.days} day(s). Tracked per (tenant, day) — survives kernel restarts via
            the persisted ledger.
          </p>
        </header>

        {top && (
          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
              Top tenants today ({top.date}) — {usd(top.total_cents)}
            </h2>
            <div className="overflow-hidden rounded-lg border border-neutral-800">
              <table className="w-full text-sm">
                <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wider text-neutral-400">
                  <tr>
                    <th className="px-3 py-2">Tenant</th>
                    <th className="px-3 py-2 text-right">Cost</th>
                    <th className="px-3 py-2 text-right">Calls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/70 font-mono text-xs">
                  {top.rows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-4 text-center text-neutral-500">
                        No spend recorded today.
                      </td>
                    </tr>
                  )}
                  {top.rows.map((r) => (
                    <tr key={r.tenant_id}>
                      <td className="px-3 py-2">
                        <div className="text-neutral-200">{r.slug ?? '—'}</div>
                        <div className="text-[10px] text-neutral-500">{r.tenant_id}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-emerald-300">{usd(r.cents)}</td>
                      <td className="px-3 py-2 text-right text-neutral-400">{r.calls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
            Your tenant — last {summary.days} days
          </h2>
          <div className="overflow-hidden rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wider text-neutral-400">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2 text-right">Cost</th>
                  <th className="px-3 py-2 text-right">Calls</th>
                  <th className="px-3 py-2">Model breakdown</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/70 font-mono text-xs">
                {summary.rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-center text-neutral-500">
                      No LLM spend yet — the ledger fills up as the router processes calls.
                    </td>
                  </tr>
                )}
                {summary.rows.map((r) => (
                  <tr key={r.date}>
                    <td className="px-3 py-2 text-neutral-300">
                      {r.date}
                      {todayRow && r.date === todayRow.date && (
                        <span className="ml-2 rounded bg-emerald-700/40 px-1.5 py-0.5 text-[9px] uppercase text-emerald-200">
                          today
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-emerald-300">{usd(r.cents)}</td>
                    <td className="px-3 py-2 text-right text-neutral-400">{r.calls}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(r.models)
                          .sort((a, b) => b[1] - a[1])
                          .map(([model, cents]) => (
                            <span
                              key={model}
                              className="rounded border border-neutral-700 bg-neutral-800/60 px-2 py-0.5 text-[10px] text-neutral-300"
                            >
                              {model} <span className="text-emerald-300">{usd(cents)}</span>
                            </span>
                          ))}
                      </div>
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
