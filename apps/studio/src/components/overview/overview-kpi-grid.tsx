import { OVERVIEW_DASHBOARD_KPIS } from '@/lib/mock-data';
import { ACCENT_TEXT } from '@/lib/nav';
import Link from 'next/link';
import { UtilIcon } from '../icons';
import { Sparkline } from './sparkline';

const TREND_COLOR = {
  up: 'text-accent-green',
  down: 'text-accent-rose',
  flat: 'text-neutral-400',
} as const;
const TREND_SIGN = { up: '▲', down: '▼', flat: '■' } as const;

/** A. KPI Summary — 6 KPI chính, mỗi card có sparkline + link sang module sâu. */
export function OverviewKpiGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {OVERVIEW_DASHBOARD_KPIS.map((kpi) => (
        <Link
          key={kpi.label}
          href={kpi.href}
          className="group rounded-xl border border-hairline bg-raised/50 px-4 py-3.5 transition hover:border-neutral-700 hover:bg-raised"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-neutral-400">{kpi.label}</p>
            <UtilIcon
              name="chevron"
              width={12}
              height={12}
              className="text-neutral-700 transition group-hover:text-neutral-400"
            />
          </div>
          <p className={`mt-1.5 text-xl font-semibold tracking-tight ${ACCENT_TEXT[kpi.accent]}`}>
            {kpi.value}
          </p>
          <div className="mt-1 flex items-end justify-between gap-2">
            {kpi.delta && (
              <span className={`text-[11px] font-medium ${TREND_COLOR[kpi.trend ?? 'flat']}`}>
                {TREND_SIGN[kpi.trend ?? 'flat']} {kpi.delta}
              </span>
            )}
            <Sparkline data={kpi.spark} accent={kpi.accent} width={68} height={24} />
          </div>
        </Link>
      ))}
    </div>
  );
}
