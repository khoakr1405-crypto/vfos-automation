import { StatCard } from '@/components/stat-card';
import { OfflineBanner } from '@/components/offline-banner';
import {
  getBudget,
  getBus,
  getDrivers,
  getEvents,
  getMetricsText,
  getPlugins,
  getQueues,
  getSyscalls,
  type KernelEvent,
} from '@/lib/kernel';
import { parsePrometheus, topLabels } from '@/lib/prom-parse';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface DashboardData {
  syscalls: number;
  plugins: number;
  drivers: { name: string; models: number }[];
  busName: string;
  queueImpl: string;
  queues: { name: string; stats: { active: number; waiting: number; completed: number; failed: number } | null }[];
  budget: { spent_cents: number; ceiling_cents: number; date: string; blocked: boolean };
  events: KernelEvent[];
  complianceTally: { PASS: number; REJECT: number; HUMAN_REVIEW: number };
  renderCompleted: number;
  llmCalls: number;
  llmSpendByModel: { label: string; value: number }[];
}

async function loadDashboard(): Promise<DashboardData | { error: unknown }> {
  try {
    const [syscalls, plugins, drivers, queues, bus, budget, eventsRes, metricsText] =
      await Promise.all([
        getSyscalls(),
        getPlugins(),
        getDrivers(),
        getQueues(),
        getBus(),
        getBudget(),
        getEvents({ limit: 200 }),
        getMetricsText().catch(() => ''),
      ]);
    const events = eventsRes.events;
    const complianceEvents = events.filter((e) => e.schema === 'compliance.decision.v1');
    const tally = { PASS: 0, REJECT: 0, HUMAN_REVIEW: 0 } as DashboardData['complianceTally'];
    for (const e of complianceEvents) {
      const d = (e.payload as { decision?: string }).decision;
      if (d === 'PASS' || d === 'REJECT' || d === 'HUMAN_REVIEW') tally[d] += 1;
    }
    const renderCompleted = events.filter((e) => e.schema === 'render.completed.v1').length;
    const series = parsePrometheus(metricsText);
    const callsSeries = series.find((s) => s.name === 'vfos_llm_calls_total');
    const costSeries = series.find((s) => s.name === 'vfos_llm_cost_cents_total');
    const llmCalls = callsSeries
      ? callsSeries.samples
          .filter((s) => s.name === callsSeries.name)
          .reduce((a, s) => a + s.value, 0)
      : 0;
    const llmSpendByModel = costSeries ? topLabels(costSeries, 'model', 5) : [];
    return {
      syscalls: syscalls.syscalls.length,
      plugins: plugins.plugins.length,
      drivers: drivers.drivers.map((d) => ({ name: d.name, models: d.models.length })),
      busName: bus.name,
      queueImpl: bus.queue,
      queues: queues.queues.map((q) => ({
        name: q.name,
        stats: q.stats
          ? {
              active: q.stats.active,
              waiting: q.stats.waiting,
              completed: q.stats.completed,
              failed: q.stats.failed,
            }
          : null,
      })),
      budget,
      events: events.slice(0, 10),
      complianceTally: tally,
      renderCompleted,
      llmCalls,
      llmSpendByModel,
    };
  } catch (err) {
    return { error: err };
  }
}

export default async function DashboardPage() {
  const data = await loadDashboard();
  if ('error' in data) return <OfflineBanner error={data.error} />;

  const spentUsd = (data.budget.spent_cents / 100).toFixed(2);
  const ceilingUsd = (data.budget.ceiling_cents / 100).toFixed(2);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-neutral-100">Dashboard</h1>
        <p className="text-sm text-neutral-400">
          Live kernel state — auto-refresh on page load.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Plugins loaded" value={data.plugins} accent="emerald" />
        <StatCard label="Syscalls registered" value={data.syscalls} />
        <StatCard label="LLM drivers" value={data.drivers.length} hint={data.drivers.map((d) => d.name).join(', ')} />
        <StatCard label="Bus / Queue" value={`${data.busName} / ${data.queueImpl}`} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
          Compliance decisions (last 200 events)
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="PASS" value={data.complianceTally.PASS} accent="emerald" />
          <StatCard label="HUMAN_REVIEW" value={data.complianceTally.HUMAN_REVIEW} accent="amber" />
          <StatCard label="REJECT" value={data.complianceTally.REJECT} accent="rose" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">Queues</h2>
        <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950/40">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900/40 text-left text-xs uppercase tracking-wider text-neutral-400">
              <tr>
                <th className="px-4 py-2">Queue</th>
                <th className="px-4 py-2 text-right">Waiting</th>
                <th className="px-4 py-2 text-right">Active</th>
                <th className="px-4 py-2 text-right">Completed</th>
                <th className="px-4 py-2 text-right">Failed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/70 font-mono">
              {data.queues.map((q) => (
                <tr key={q.name}>
                  <td className="px-4 py-2 text-neutral-200">{q.name}</td>
                  <td className="px-4 py-2 text-right text-neutral-300">{q.stats?.waiting ?? '—'}</td>
                  <td className="px-4 py-2 text-right text-neutral-300">{q.stats?.active ?? '—'}</td>
                  <td className="px-4 py-2 text-right text-emerald-400">{q.stats?.completed ?? '—'}</td>
                  <td className="px-4 py-2 text-right text-rose-400">{q.stats?.failed ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          label="Budget today"
          value={`$${spentUsd} / $${ceilingUsd}${data.budget.blocked ? ' · BLOCKED' : ''}`}
          hint={data.budget.date}
          accent={
            data.budget.blocked
              ? 'rose'
              : data.budget.spent_cents > data.budget.ceiling_cents * 0.8
              ? 'amber'
              : 'default'
          }
        />
        <StatCard label="LLM calls (lifetime)" value={data.llmCalls} accent="emerald" />
        <StatCard label="Render jobs completed" value={data.renderCompleted} accent="sky" />
      </section>

      {data.llmSpendByModel.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
            LLM spend by model (cents, lifetime)
          </h2>
          <div className="overflow-hidden rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wider text-neutral-400">
                <tr>
                  <th className="px-4 py-2">Model</th>
                  <th className="px-4 py-2 text-right">Cents</th>
                  <th className="px-4 py-2 text-right">USD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/70 font-mono text-xs">
                {data.llmSpendByModel.map((row) => (
                  <tr key={row.label}>
                    <td className="px-4 py-2 text-emerald-300">{row.label}</td>
                    <td className="px-4 py-2 text-right text-neutral-200">
                      {row.value.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-400">
                      ${(row.value / 100).toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
          Latest 10 events
        </h2>
        <div className="overflow-hidden rounded-lg border border-neutral-800">
          <ul className="divide-y divide-neutral-800/70 font-mono text-xs">
            {data.events.map((e) => (
              <li key={e.event_id} className="grid grid-cols-12 gap-2 px-4 py-2">
                <span className="col-span-3 text-neutral-500">
                  {e.emitted_at.slice(11, 19)}
                </span>
                <span className="col-span-4 text-emerald-300">{e.schema}</span>
                <span className="col-span-5 truncate text-neutral-400">{e.emitter}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
