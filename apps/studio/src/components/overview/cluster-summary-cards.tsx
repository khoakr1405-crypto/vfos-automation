import { CLUSTER_SUMMARIES } from '@/lib/mock-data';
import { ACCENT_TEXT } from '@/lib/nav';
import Link from 'next/link';
import { LanePill, PlatformPill } from '../badge';
import { Card, CardBody, CardHeader } from '../card';
import { Icon, UtilIcon } from '../icons';
import { Button } from '../ui';

const CLUSTER_ICONS: Record<string, React.ReactNode> = {
  review: <Icon name="create" width={16} height={16} />,
  'cau-ca': <Icon name="channels" width={16} height={16} />,
  'rua-xe': <Icon name="products" width={16} height={16} />,
};

const CLUSTER_PROGRESS = {
  review: { percent: 85, accent: 'violet', delta: '+12.4%' },
  'cau-ca': { percent: 65, accent: 'cyan', delta: '+8.1%' },
  'rua-xe': { percent: 45, accent: 'amber', delta: '-2.3%' },
} as const;

export function ClusterSummaryCards() {
  return (
    <Card>
      <CardHeader
        title="Cụm kênh hiệu quả"
        subtitle="Vận hành ngách sản phẩm affiliate"
        no={2}
        accentClass="text-accent-blue"
        right={
          <Link href="/channels">
            <Button variant="ghost" className="!py-1.5 text-neutral-500 hover:text-neutral-300">
              Xem tất cả <UtilIcon name="chevron" />
            </Button>
          </Link>
        }
      />
      <CardBody className="grid gap-4 lg:grid-cols-3">
        {CLUSTER_SUMMARIES.map((c) => {
          const prog = CLUSTER_PROGRESS[c.laneId] ?? { percent: 50, accent: 'blue', delta: '+0%' };
          return (
            <div
              key={c.laneId}
              className="flex flex-col rounded-xl border border-hairline bg-raised/30 p-4 transition hover:border-neutral-700 hover:bg-raised/50"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg bg-panel border border-hairline shrink-0 ${ACCENT_TEXT[prog.accent]}`}
                  >
                    {CLUSTER_ICONS[c.laneId]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-neutral-100 truncate">{c.name}</p>
                    <p className="text-[10px] text-neutral-500">{c.channels} kênh hoạt động</p>
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold ${prog.delta.startsWith('+') ? 'text-accent-green' : 'text-accent-rose'}`}
                >
                  {prog.delta}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs mb-4">
                <Stat label="Lượt xem" value={c.views} />
                <Stat
                  label="CTR"
                  value={
                    c.laneId === 'review' ? '4.21%' : c.laneId === 'cau-ca' ? '4.81%' : '3.92%'
                  }
                />
                <Stat label="Doanh thu" value={c.revenue} accent />
              </div>

              {/* Custom styled progress bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-neutral-500">
                  <span>Hiệu suất cụm</span>
                  <span className={`font-semibold ${ACCENT_TEXT[prog.accent]}`}>
                    {prog.percent}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-panel rounded-full overflow-hidden border border-hairline/20">
                  <div
                    className={`h-full rounded-full bg-current ${ACCENT_TEXT[prog.accent]}`}
                    style={{ width: `${prog.percent}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-hairline/50 pt-3">
                <div className="flex gap-1">
                  {c.platforms.map((p) => (
                    <PlatformPill key={p} platform={p} />
                  ))}
                </div>
                <Link href="/channels">
                  <span className="text-[11px] font-medium text-neutral-400 hover:text-neutral-200 flex items-center gap-1 cursor-pointer">
                    Chi tiết <UtilIcon name="chevron" width={10} height={10} />
                  </span>
                </Link>
              </div>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-panel/60 px-2 py-1.5">
      <p className="text-[9px] text-neutral-500 uppercase tracking-wider">{label}</p>
      <p
        className={`text-xs font-bold mt-0.5 ${accent ? 'text-accent-green' : 'text-neutral-100'}`}
      >
        {value}
      </p>
    </div>
  );
}
