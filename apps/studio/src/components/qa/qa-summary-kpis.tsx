import { QA_SUMMARY_KPIS } from '@/lib/mock-data';
import { StatCard } from '../stat-card';

/** A. QA Summary KPI. */
export function QaSummaryKpis() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {QA_SUMMARY_KPIS.map((k) => (
        <StatCard key={k.label} {...k} />
      ))}
    </div>
  );
}
