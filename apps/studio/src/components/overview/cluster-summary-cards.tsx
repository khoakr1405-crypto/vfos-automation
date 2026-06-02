import { CLUSTER_SUMMARIES } from '@/lib/mock-data';
import Link from 'next/link';
import { LanePill, PlatformPill } from '../badge';
import { Card, CardBody, CardHeader } from '../card';
import { UtilIcon } from '../icons';
import { Button } from '../ui';

/** B. Cụm kênh hiệu quả — 3 ngách chính, link sang /channels. */
export function ClusterSummaryCards() {
  return (
    <Card>
      <CardHeader
        title="Cụm kênh hiệu quả"
        subtitle="Tóm tắt theo ngách — chi tiết ở Cụm kênh & Kênh"
        no={2}
        accentClass="text-accent-blue"
        right={
          <Link href="/channels">
            <Button variant="ghost" className="!py-1.5">
              Mở module <UtilIcon name="chevron" />
            </Button>
          </Link>
        }
      />
      <CardBody className="grid gap-3 lg:grid-cols-3">
        {CLUSTER_SUMMARIES.map((c) => (
          <div
            key={c.laneId}
            className="flex flex-col rounded-xl border border-hairline bg-raised/40 p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <LanePill laneId={c.laneId} />
              <span className="text-[10px] text-neutral-500">{c.channels} kênh</span>
            </div>

            <dl className="grid grid-cols-2 gap-2 text-xs">
              <Stat label="Nội dung" value={String(c.contents)} />
              <Stat label="Lượt xem" value={c.views} />
              <Stat label="Click" value={c.clicks} />
              <Stat label="Doanh thu" value={c.revenue} accent />
            </dl>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {c.platforms.map((p) => (
                <PlatformPill key={p} platform={p} />
              ))}
            </div>

            <Link href="/channels" className="mt-3">
              <Button variant="outline" className="w-full">
                Xem chi tiết <UtilIcon name="chevron" width={13} height={13} />
              </Button>
            </Link>
          </div>
        ))}
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
    <div className="rounded-lg bg-panel/60 px-2.5 py-2">
      <dt className="text-[10px] text-neutral-500">{label}</dt>
      <dd className={`text-sm font-semibold ${accent ? 'text-accent-green' : 'text-neutral-100'}`}>
        {value}
      </dd>
    </div>
  );
}
