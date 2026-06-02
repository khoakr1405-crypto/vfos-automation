import { PUBLISH_SUMMARY_KPIS } from '@/lib/mock-data';
import { StatCard } from '../stat-card';

/** A. Publish Summary KPI — tổng hợp nhanh trạng thái xuất bản. */
export function PublishSummaryKpis() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {PUBLISH_SUMMARY_KPIS.map((k) => (
        <StatCard key={k.label} {...k} />
      ))}
    </div>
  );
}
