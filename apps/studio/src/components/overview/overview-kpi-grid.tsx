import { OVERVIEW_DASHBOARD_KPIS } from '@/lib/mock-data';
import { ACCENT_TEXT } from '@/lib/nav';
import Link from 'next/link';
import { Icon, UtilIcon } from '../icons';
import { Sparkline } from './sparkline';

const TREND_COLOR = {
  up: 'text-accent-green',
  down: 'text-accent-rose',
  flat: 'text-neutral-400',
} as const;
const TREND_SIGN = { up: '▲', down: '▼', flat: '■' } as const;

// Define icon mappings for the 7 cards
const KPI_ICONS: Record<string, React.ReactNode> = {
  'Job đang chạy': <UtilIcon name="clock" width={14} height={14} />,
  'Nội dung đã tạo': <Icon name="create" width={14} height={14} />,
  'Video đã xuất bản': <Icon name="publish" width={14} height={14} />,
  'Lượt xem': <Icon name="analytics" width={14} height={14} />,
  'Lượt click': <UtilIcon name="link" width={14} height={14} />,
  CTR: <Icon name="channels" width={14} height={14} />,
  'Doanh thu ước tính': <Icon name="products" width={14} height={14} />,
};

/** A. KPI Summary — 7 KPI chính, mỗi card có sparkline + icon + link sang module sâu. */
export function OverviewKpiGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
      {OVERVIEW_DASHBOARD_KPIS.map((kpi) => (
        <Link
          key={kpi.label}
          href={kpi.href}
          className="group rounded-xl border border-hairline bg-raised/50 px-4 py-3.5 transition hover:border-neutral-700 hover:bg-raised"
        >
          <div className="flex items-start justify-between gap-1">
            <div className="flex items-start gap-1.5 min-w-0">
              <span className={`shrink-0 mt-0.5 ${ACCENT_TEXT[kpi.accent]}`}>
                {KPI_ICONS[kpi.label] ?? <Icon name="overview" width={14} height={14} />}
              </span>
              <p className="text-[10px] font-semibold text-neutral-400 leading-snug whitespace-normal">
                {kpi.label}
              </p>
            </div>
            <UtilIcon
              name="chevron"
              width={9}
              height={9}
              className="text-neutral-700 transition group-hover:text-neutral-400 shrink-0 mt-0.5"
            />
          </div>
          <p className={`mt-2 text-lg font-bold tracking-tight ${ACCENT_TEXT[kpi.accent]}`}>
            {kpi.value}
          </p>
          <div className="mt-1.5 flex items-end justify-between gap-2">
            {kpi.delta && (
              <span className={`text-[10px] font-medium ${TREND_COLOR[kpi.trend ?? 'flat']}`}>
                {TREND_SIGN[kpi.trend ?? 'flat']} {kpi.delta}
              </span>
            )}
            <Sparkline data={kpi.spark} accent={kpi.accent} width={50} height={20} />
          </div>
        </Link>
      ))}
    </div>
  );
}
