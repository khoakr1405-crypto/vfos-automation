import { OfflineBanner } from '@/components/offline-banner';
import { StatCard } from '@/components/stat-card';
import { getMetricsText } from '@/lib/kernel';
import { counterTotal, parsePrometheus, topLabels } from '@/lib/prom-parse';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const HIGHLIGHT_SERIES = [
  'vfos_syscall_total',
  'vfos_event_published_total',
  'vfos_event_handled_total',
  'vfos_queue_enqueued_total',
  'vfos_queue_job_total',
  'vfos_llm_calls_total',
  'vfos_llm_tokens_total',
  'vfos_llm_cost_cents_total',
  'vfos_compliance_decision_total',
];

export default async function MetricsPage() {
  let text: string;
  try {
    text = await getMetricsText();
  } catch (err) {
    return <OfflineBanner error={err} />;
  }

  const all = parsePrometheus(text);
  const byName = new Map(all.map((s) => [s.name, s]));

  const syscall = byName.get('vfos_syscall_total');
  const decisions = byName.get('vfos_compliance_decision_total');
  const llmCalls = byName.get('vfos_llm_calls_total');
  const llmTokens = byName.get('vfos_llm_tokens_total');
  const llmCost = byName.get('vfos_llm_cost_cents_total');
  const queueJobs = byName.get('vfos_queue_job_total');
  const events = byName.get('vfos_event_published_total');

  const llmTokensTotal = llmTokens ? counterTotal(llmTokens) : 0;
  const llmCostCents = llmCost ? counterTotal(llmCost) : 0;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-neutral-100">Metrics</h1>
        <p className="text-sm text-neutral-400">
          Live Prometheus counters from <code className="font-mono">/metrics</code> (OTel SDK).
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Syscall invocations"
          value={syscall ? counterTotal(syscall).toLocaleString() : '—'}
          accent="emerald"
        />
        <StatCard
          label="Compliance decisions"
          value={decisions ? counterTotal(decisions).toLocaleString() : '—'}
        />
        <StatCard
          label="LLM calls"
          value={llmCalls ? counterTotal(llmCalls).toLocaleString() : '—'}
          accent="sky"
        />
        <StatCard
          label="LLM cost (USD)"
          value={`$${(llmCostCents / 100).toFixed(4)}`}
          hint={`${llmTokensTotal.toLocaleString()} tokens`}
          accent={llmCostCents > 0 ? 'amber' : 'default'}
        />
      </section>

      <Breakdown title="Syscalls by name" series={syscall} labelKey="name" />
      <Breakdown title="Compliance decisions" series={decisions} labelKey="decision" />
      <Breakdown title="LLM calls by model" series={llmCalls} labelKey="model" />
      <Breakdown title="Queue jobs by queue" series={queueJobs} labelKey="queue" />
      <Breakdown title="Events by schema" series={events} labelKey="schema" />

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
          All series ({all.length})
        </h2>
        <div className="overflow-hidden rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wider text-neutral-400">
              <tr>
                <th className="px-4 py-2">Metric</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2 text-right">Samples</th>
                <th className="px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/70 font-mono text-xs">
              {all.map((s) => {
                const total = ['counter', 'gauge'].includes(s.type) ? counterTotal(s) : null;
                const highlight = HIGHLIGHT_SERIES.includes(s.name);
                return (
                  <tr key={s.name} className={highlight ? 'bg-emerald-900/10' : undefined}>
                    <td className="px-4 py-2 text-neutral-200">{s.name}</td>
                    <td className="px-4 py-2 text-neutral-500">{s.type}</td>
                    <td className="px-4 py-2 text-right text-neutral-400">{s.samples.length}</td>
                    <td className="px-4 py-2 text-right text-neutral-300">
                      {total === null ? '—' : total.toLocaleString()}
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
}

function Breakdown({
  title,
  series,
  labelKey,
}: {
  title: string;
  series: ReturnType<typeof parsePrometheus>[number] | undefined;
  labelKey: string;
}) {
  if (!series) return null;
  const rows = topLabels(series, labelKey, 8);
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-neutral-400">
        {title}
      </h2>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3">
            <div className="w-40 truncate font-mono text-xs text-neutral-300">{r.label}</div>
            <div className="h-2 flex-1 overflow-hidden rounded bg-neutral-900">
              <div
                className="h-full bg-emerald-500/60"
                style={{ width: `${max > 0 ? (r.value / max) * 100 : 0}%` }}
              />
            </div>
            <div className="w-16 text-right font-mono text-xs text-neutral-400">
              {r.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
