import Link from 'next/link';
import { OfflineBanner } from '@/components/offline-banner';
import { listSchedules } from '@/lib/kernel';
import {
  deleteScheduleAction,
  runNowAction,
  toggleScheduleAction,
} from './actions';
import { CreateScheduleForm } from './create-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function fmt(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toISOString().slice(0, 19).replace('T', ' ');
}

const STATUS_COLOUR: Record<string, string> = {
  published: 'text-emerald-300',
  queued: 'text-sky-300',
  rejected_compliance: 'text-amber-300',
  no_connector: 'text-amber-300',
  render_timeout: 'text-rose-300',
  failed: 'text-rose-300',
};

export default async function SchedulerPage() {
  try {
    const { schedules } = await listSchedules();
    return (
      <div className="space-y-8">
        <header>
          <h1 className="text-2xl font-semibold text-neutral-100">Scheduler</h1>
          <p className="text-sm text-neutral-400">
            {schedules.length} schedule(s). The scheduler loop wakes every 30s and enqueues
            <code className="ml-1 font-mono">vfos.scheduler</code> jobs for any cron expression
            whose <code className="font-mono">next_run_at</code> is in the past. Each job invokes
            <code className="ml-1 font-mono">pipeline.run</code> with the stored args.
          </p>
        </header>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
            New schedule
          </h2>
          <CreateScheduleForm />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
            Scheduled pipelines
          </h2>
          <div className="overflow-hidden rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wider text-neutral-400">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Cron</th>
                  <th className="px-3 py-2">Target</th>
                  <th className="px-3 py-2">Next run</th>
                  <th className="px-3 py-2">Last run</th>
                  <th className="px-3 py-2">Last status</th>
                  <th className="px-3 py-2">Enabled</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/70 font-mono text-xs">
                {schedules.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-4 text-center text-neutral-500">
                      No schedules yet — create one above.
                    </td>
                  </tr>
                )}
                {schedules.map((s) => {
                  const target =
                    (s.args as { target_platform?: string }).target_platform ?? '—';
                  return (
                    <tr key={s.id}>
                      <td className="px-3 py-2 text-neutral-200">{s.name}</td>
                      <td className="px-3 py-2 text-amber-300">{s.cron_expr}</td>
                      <td className="px-3 py-2 text-neutral-400">{target}</td>
                      <td className="px-3 py-2 text-neutral-300">{fmt(s.next_run_at)}</td>
                      <td className="px-3 py-2 text-neutral-500">{fmt(s.last_run_at)}</td>
                      <td className="px-3 py-2">
                        {s.last_status ? (
                          <span className={STATUS_COLOUR[s.last_status] ?? 'text-neutral-400'}>
                            {s.last_status}
                            {s.last_trace_id && (
                              <>
                                {' '}
                                <Link
                                  href={`/traces/${s.last_trace_id}`}
                                  className="underline text-sky-400 hover:text-sky-300"
                                >
                                  ↗
                                </Link>
                              </>
                            )}
                          </span>
                        ) : (
                          <span className="text-neutral-500">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <form action={toggleScheduleAction}>
                          <input type="hidden" name="id" value={s.id} />
                          <input
                            type="hidden"
                            name="enabled"
                            value={String(s.enabled)}
                          />
                          <button
                            type="submit"
                            className={`rounded px-2 py-0.5 text-[10px] uppercase ${
                              s.enabled
                                ? 'bg-emerald-700/40 text-emerald-200 hover:bg-emerald-600/40'
                                : 'bg-neutral-700/40 text-neutral-300 hover:bg-neutral-600/40'
                            }`}
                          >
                            {s.enabled ? 'on' : 'off'}
                          </button>
                        </form>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <form action={runNowAction} className="inline-block">
                          <input type="hidden" name="id" value={s.id} />
                          <button
                            type="submit"
                            className="mr-1 rounded bg-sky-700/60 px-2 py-1 text-[10px] uppercase text-sky-100 hover:bg-sky-600"
                          >
                            Run now
                          </button>
                        </form>
                        <form action={deleteScheduleAction} className="inline-block">
                          <input type="hidden" name="id" value={s.id} />
                          <button
                            type="submit"
                            className="rounded bg-rose-800/60 px-2 py-1 text-[10px] uppercase text-rose-100 hover:bg-rose-700"
                          >
                            Delete
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
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
