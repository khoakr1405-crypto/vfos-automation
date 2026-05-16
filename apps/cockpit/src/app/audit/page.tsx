import Link from 'next/link';
import { OfflineBanner } from '@/components/offline-banner';
import { getAuditSummary, listAuditEntries } from '@/lib/kernel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface SearchParams {
  action?: string;
  status?: 'ok' | 'error';
  limit?: string;
}

function fmt(ts: string): string {
  return new Date(ts).toISOString().slice(0, 19).replace('T', ' ');
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  try {
    const sp = await searchParams;
    const limit = Math.min(Number(sp.limit ?? '100'), 500);
    const [list, summary] = await Promise.all([
      listAuditEntries({
        limit,
        ...(sp.action ? { action: sp.action } : {}),
        ...(sp.status ? { status: sp.status } : {}),
      }),
      getAuditSummary(24),
    ]);
    const okTotal = summary.rows.filter((r) => r.status === 'ok').reduce((s, r) => s + r.n, 0);
    const errTotal = summary.rows
      .filter((r) => r.status === 'error')
      .reduce((s, r) => s + r.n, 0);
    return (
      <div className="space-y-8">
        <header>
          <h1 className="text-2xl font-semibold text-neutral-100">Audit log</h1>
          <p className="text-sm text-neutral-400">
            Last 24h · <span className="text-emerald-300">{okTotal}</span> ok ·{' '}
            <span className="text-rose-300">{errTotal}</span> error. Tenant tokens see only
            their own actions; admin tokens see every tenant.
          </p>
        </header>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
            Top actions (24h)
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {summary.rows.length === 0 && (
              <div className="rounded border border-neutral-800 bg-neutral-900/40 p-3 text-xs text-neutral-500">
                No audit entries in the last 24 hours.
              </div>
            )}
            {summary.rows.slice(0, 12).map((r) => (
              <Link
                key={`${r.action}::${r.status}`}
                href={`/audit?action=${encodeURIComponent(r.action)}&status=${r.status}`}
                className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900/40 px-3 py-2 font-mono text-xs hover:bg-neutral-900"
              >
                <span className="truncate text-neutral-200">{r.action}</span>
                <span
                  className={`ml-2 rounded px-2 py-0.5 text-[10px] uppercase ${
                    r.status === 'ok'
                      ? 'bg-emerald-700/40 text-emerald-200'
                      : 'bg-rose-700/40 text-rose-200'
                  }`}
                >
                  {r.status} · {r.n}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wider text-neutral-400">
              Recent entries
              {sp.action && (
                <span className="ml-2 rounded bg-amber-700/30 px-2 py-0.5 font-mono text-[10px] text-amber-200">
                  action={sp.action}
                </span>
              )}
              {sp.status && (
                <span className="ml-2 rounded bg-amber-700/30 px-2 py-0.5 font-mono text-[10px] text-amber-200">
                  status={sp.status}
                </span>
              )}
            </h2>
            {(sp.action || sp.status) && (
              <Link
                href="/audit"
                className="text-xs text-neutral-400 hover:text-neutral-200"
              >
                clear filters
              </Link>
            )}
          </div>
          <div className="overflow-hidden rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wider text-neutral-400">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Actor</th>
                  <th className="px-3 py-2">Target</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">ms</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/70 font-mono text-xs">
                {list.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                      no audit entries matched
                    </td>
                  </tr>
                )}
                {list.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-neutral-500">{fmt(r.at)}</td>
                    <td className="px-3 py-2 text-amber-300">{r.action}</td>
                    <td className="px-3 py-2 text-neutral-300">{r.actor}</td>
                    <td className="px-3 py-2 max-w-xs truncate text-neutral-400" title={r.target ?? ''}>
                      {r.target ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      {r.status === 'ok' ? (
                        <span className="rounded bg-emerald-700/40 px-2 py-0.5 text-[10px] uppercase text-emerald-200">
                          ok
                        </span>
                      ) : (
                        <span
                          className="rounded bg-rose-700/40 px-2 py-0.5 text-[10px] uppercase text-rose-200"
                          title={r.error ?? ''}
                        >
                          error
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-neutral-500">{r.duration_ms}</td>
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
