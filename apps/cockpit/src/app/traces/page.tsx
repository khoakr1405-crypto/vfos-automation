import Link from 'next/link';
import { OfflineBanner } from '@/components/offline-banner';
import { listTraces } from '@/lib/kernel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATUS_BADGE: Record<string, string> = {
  OK: 'bg-emerald-700/40 text-emerald-200',
  ERROR: 'bg-rose-700/40 text-rose-200',
  UNSET: 'bg-neutral-700/40 text-neutral-300',
};

function fmtTime(ms: number): string {
  return new Date(ms).toISOString().slice(11, 23);
}

export default async function TracesPage() {
  try {
    const { traces } = await listTraces(100);
    const maxDuration = traces.reduce((m, t) => Math.max(m, t.duration_ms), 0);
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-neutral-100">Traces</h1>
          <p className="text-sm text-neutral-400">
            {traces.length} recent trace(s). OTel spans propagate W3C{' '}
            <code className="font-mono">traceparent</code> through bus + queue,
            stitching syscalls → llm → bus.handle → queue.job into one chain.
          </p>
        </header>

        <div className="overflow-hidden rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wider text-neutral-400">
              <tr>
                <th className="px-4 py-2">Started</th>
                <th className="px-4 py-2">Root</th>
                <th className="px-4 py-2 text-right">Spans</th>
                <th className="px-4 py-2 text-right">Duration</th>
                <th className="px-4 py-2">Bar</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Trace ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/70 font-mono text-xs">
              {traces.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-neutral-500">
                    No traces yet — exercise the kernel and refresh.
                  </td>
                </tr>
              )}
              {traces.map((t) => {
                const widthPct = maxDuration > 0 ? (t.duration_ms / maxDuration) * 100 : 0;
                return (
                  <tr key={t.trace_id} className="hover:bg-neutral-900/40">
                    <td className="px-4 py-2 text-neutral-500">{fmtTime(t.start_unix_ms)}</td>
                    <td className="px-4 py-2 text-emerald-300">{t.root_name}</td>
                    <td className="px-4 py-2 text-right text-neutral-300">{t.spans}</td>
                    <td className="px-4 py-2 text-right text-neutral-300">{t.duration_ms} ms</td>
                    <td className="px-4 py-2">
                      <div className="h-2 w-32 overflow-hidden rounded bg-neutral-900">
                        <div
                          className="h-full bg-sky-500/60"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] uppercase ${
                          STATUS_BADGE[t.status] ?? STATUS_BADGE.UNSET
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/traces/${t.trace_id}`}
                        className="text-sky-400 hover:text-sky-300"
                      >
                        {t.trace_id.slice(0, 16)}…
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  } catch (err) {
    return <OfflineBanner error={err} />;
  }
}
