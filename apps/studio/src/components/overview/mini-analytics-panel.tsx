import {
  LANES,
  LANE_LABEL,
  REVENUE_BY_LANE,
  SEVEN_DAY_LABELS,
  SEVEN_DAY_VIEWS,
  TOP_PRODUCTS,
  TOP_VIDEOS,
} from '@/lib/mock-data';
import { ACCENT_TEXT } from '@/lib/nav';
import Link from 'next/link';
import { LanePill, PlatformPill } from '../badge';
import { Card, CardBody, CardHeader } from '../card';
import { UtilIcon } from '../icons';
import { Button } from '../ui';

/** F. Mini Analytics — 7 ngày + doanh thu theo cụm + top nội dung + top sản phẩm. */
export function MiniAnalyticsPanel() {
  const maxViews = Math.max(...SEVEN_DAY_VIEWS, 1);

  return (
    <Card>
      <CardHeader
        title="Mini Analytics"
        subtitle="7 ngày qua · doanh thu theo cụm · top hiệu quả"
        no={10}
        accentClass="text-accent-green"
        right={
          <Link href="/analytics">
            <Button variant="ghost" className="!py-1.5">
              Mở module <UtilIcon name="chevron" />
            </Button>
          </Link>
        }
      />
      <CardBody className="grid gap-5 lg:grid-cols-3">
        {/* 7-day views + revenue by lane */}
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-[11px] font-medium text-neutral-400">Lượt xem 7 ngày (nghìn)</p>
            <div className="flex h-24 items-end gap-1.5">
              {SEVEN_DAY_VIEWS.map((v, i) => (
                <div key={SEVEN_DAY_LABELS[i]} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-20 w-full items-end rounded bg-raised/50">
                    <div
                      className="w-full rounded bg-accent-green/70"
                      style={{ height: `${Math.round((v / maxViews) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-neutral-600">{SEVEN_DAY_LABELS[i]}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-medium text-neutral-400">Doanh thu theo cụm</p>
            <div className="space-y-2">
              {REVENUE_BY_LANE.map((row) => {
                const lane = LANES.find((l) => l.id === row.laneId);
                return (
                  <div key={row.laneId}>
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="text-neutral-400">{LANE_LABEL[row.laneId]}</span>
                      <span className={`font-semibold ${ACCENT_TEXT[lane?.accent ?? 'blue']}`}>
                        {row.percent}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                      <div
                        className={`h-full rounded-full bg-current ${ACCENT_TEXT[lane?.accent ?? 'blue']}`}
                        style={{ width: `${row.percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Top 3 contents */}
        <div>
          <p className="mb-2 text-[11px] font-medium text-neutral-400">Top 3 nội dung</p>
          <ul className="space-y-2">
            {TOP_VIDEOS.slice(0, 3).map((v, i) => (
              <li
                key={`${v.title}-${v.platform}`}
                className="flex items-center gap-2.5 rounded-lg border border-hairline bg-raised/40 px-3 py-2"
              >
                <span className="text-xs font-bold text-neutral-600">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-neutral-100">{v.title}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <LanePill laneId={v.laneId} />
                    <PlatformPill platform={v.platform} />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-accent-green">{v.revenue}</p>
                  <p className="text-[10px] text-neutral-500">{v.views} view</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Top 3 products */}
        <div>
          <p className="mb-2 text-[11px] font-medium text-neutral-400">Top 3 sản phẩm / link</p>
          <ul className="space-y-2">
            {TOP_PRODUCTS.map((p, i) => (
              <li
                key={p.name}
                className="flex items-center gap-2.5 rounded-lg border border-hairline bg-raised/40 px-3 py-2"
              >
                <span className="text-xs font-bold text-neutral-600">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-neutral-100">{p.name}</p>
                  <div className="mt-1">
                    <LanePill laneId={p.laneId} />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-accent-green">{p.revenue}</p>
                  <p className="text-[10px] text-neutral-500">{p.clicks} click</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </CardBody>
    </Card>
  );
}
