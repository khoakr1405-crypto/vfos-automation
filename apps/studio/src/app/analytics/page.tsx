import { LanePill, PlatformPill } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import { MockBanner } from '@/components/mock-banner';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui';
import {
  FUNNEL_KPIS,
  LANES,
  LANE_LABEL,
  REVENUE_BY_LANE,
  REVENUE_BY_PLATFORM,
  TOP_VIDEOS,
} from '@/lib/mock-data';
import { ACCENT_TEXT } from '@/lib/nav';

// Hex per accent for the conic-gradient donut (CSS gradients can't read Tailwind classes).
const ACCENT_HEX: Record<string, string> = {
  blue: '#3b82f6',
  cyan: '#22d3ee',
  amber: '#f59e0b',
  violet: '#8b5cf6',
  green: '#22c55e',
  rose: '#f43f5e',
};

export default function AnalyticsPage() {
  // Build conic-gradient stops from cumulative lane percentages.
  let acc = 0;
  const stops = REVENUE_BY_LANE.map((row) => {
    const lane = LANES.find((l) => l.id === row.laneId);
    const hex = ACCENT_HEX[lane?.accent ?? 'blue'];
    const start = acc;
    acc += row.percent;
    return `${hex} ${start}% ${acc}%`;
  }).join(', ');

  return (
    <div className="space-y-6">
      <MockBanner />
      <PageHeader
        no={10}
        icon="analytics"
        accent="green"
        title="Hiệu suất / Analytics"
        description="View → click → chuyển đổi → doanh thu theo ngách và nền tảng. Học để tối ưu batch sau."
        actions={
          <>
            <Button variant="outline" className="!py-1.5">
              7 ngày
            </Button>
            <Button variant="ghost" className="!py-1.5">
              30 ngày
            </Button>
            <Button variant="ghost" className="!py-1.5">
              90 ngày
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {FUNNEL_KPIS.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Revenue by lane — donut */}
        <Card>
          <CardHeader
            title="Doanh thu theo ngách"
            subtitle="Tỷ trọng (mock)"
            accentClass="text-accent-green"
          />
          <CardBody className="flex items-center gap-6">
            <div
              className="relative h-32 w-32 shrink-0 rounded-full"
              style={{ background: `conic-gradient(${stops})` }}
            >
              <div className="absolute inset-[14px] flex items-center justify-center rounded-full bg-card text-center">
                <div>
                  <p className="text-[10px] text-neutral-500">Tổng</p>
                  <p className="text-sm font-semibold text-neutral-100">₫68.5M</p>
                </div>
              </div>
            </div>
            <ul className="flex-1 space-y-2">
              {REVENUE_BY_LANE.map((row) => {
                const lane = LANES.find((l) => l.id === row.laneId);
                return (
                  <li key={row.laneId} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-sm bg-current"
                        style={{ color: ACCENT_HEX[lane?.accent ?? 'blue'] }}
                      />
                      <span className="text-neutral-300">{LANE_LABEL[row.laneId]}</span>
                    </span>
                    <span className={`font-semibold ${ACCENT_TEXT[lane?.accent ?? 'blue']}`}>
                      {row.percent}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>

        {/* Revenue by platform — bars */}
        <Card>
          <CardHeader
            title="Doanh thu theo nền tảng"
            subtitle="So sánh (mock)"
            accentClass="text-accent-green"
          />
          <CardBody className="space-y-4 pt-5">
            {REVENUE_BY_PLATFORM.map((row) => (
              <div key={row.platform}>
                <div className="mb-1.5 flex items-center justify-between">
                  <PlatformPill platform={row.platform} />
                  <span className="text-xs font-semibold text-neutral-100">{row.value}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-raised">
                  <div
                    className="h-full rounded-full bg-accent-green"
                    style={{ width: `${row.barPercent}%` }}
                  />
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      {/* Top performers */}
      <Card>
        <CardHeader
          title="Top video hiệu quả"
          subtitle="Theo doanh thu (mock)"
          accentClass="text-accent-green"
        />
        <CardBody className="!p-0">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-neutral-600">
              <tr className="border-b border-hairline">
                <th className="px-5 py-2.5 font-medium">Video</th>
                <th className="px-5 py-2.5 font-medium">Ngách</th>
                <th className="px-5 py-2.5 font-medium">Nền tảng</th>
                <th className="px-5 py-2.5 font-medium">Lượt xem</th>
                <th className="px-5 py-2.5 font-medium">Doanh thu</th>
              </tr>
            </thead>
            <tbody>
              {TOP_VIDEOS.map((v) => (
                <tr
                  key={`${v.title}-${v.platform}`}
                  className="border-b border-hairline/60 last:border-0 hover:bg-raised/30"
                >
                  <td className="px-5 py-3 font-medium text-neutral-100">{v.title}</td>
                  <td className="px-5 py-3">
                    <LanePill laneId={v.laneId} />
                  </td>
                  <td className="px-5 py-3">
                    <PlatformPill platform={v.platform} />
                  </td>
                  <td className="px-5 py-3 text-neutral-200">{v.views}</td>
                  <td className="px-5 py-3 text-accent-green">{v.revenue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
