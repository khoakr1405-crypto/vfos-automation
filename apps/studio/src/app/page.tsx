import { LanePill, PlatformPill, StatusBadge } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import { Icon, UtilIcon } from '@/components/icons';
import { MockBanner } from '@/components/mock-banner';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Button, RuleList } from '@/components/ui';
import {
  CHANNEL_CLUSTERS,
  FUNNEL_KPIS,
  JOBS,
  LANES,
  LANE_LABEL,
  OVERVIEW_KPIS,
  PIPELINE_STAGES,
  REVENUE_BY_LANE,
  VFOS_RULES,
} from '@/lib/mock-data';
import { ACCENT_TEXT } from '@/lib/nav';
import Link from 'next/link';

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <MockBanner />
      <PageHeader
        no={1}
        icon="overview"
        accent="blue"
        title="Tổng quan"
        description="Trung tâm điều phối nội dung video affiliate đa kênh — Facebook · TikTok · YouTube"
        actions={
          <Button variant="primary" className="!px-3.5">
            <UtilIcon name="plus" /> Tạo nội dung
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {OVERVIEW_KPIS.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {FUNNEL_KPIS.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Pipeline summary — aggregate only, deep work on /create */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Pipeline đang chạy"
            subtitle="Tổng hợp — chi tiết từng bước ở các module riêng"
            no={4}
            accentClass="text-accent-violet"
            right={
              <Link href="/create">
                <Button variant="ghost" className="!py-1.5">
                  Mở module <UtilIcon name="chevron" />
                </Button>
              </Link>
            }
          />
          <CardBody className="space-y-2">
            {JOBS.slice(0, 5).map((job) => (
              <div
                key={job.id}
                className="flex items-center gap-3 rounded-xl border border-hairline bg-raised/40 px-3.5 py-2.5"
              >
                <span className="font-mono text-[10px] text-neutral-600">{job.id}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-neutral-200">{job.title}</p>
                  <p className="text-[10px] text-neutral-500">
                    {PIPELINE_STAGES[job.stageIndex]} · {job.updatedAt}
                  </p>
                </div>
                <LanePill laneId={job.laneId} />
                <PlatformPill platform={job.platform} />
                <StatusBadge status={job.status} />
              </div>
            ))}
          </CardBody>
        </Card>

        {/* VFOS rules — always visible */}
        <Card>
          <CardHeader
            title="Ghi chú quan trọng"
            subtitle="Rule VFOS bắt buộc"
            accentClass="text-accent-green"
          />
          <CardBody>
            <RuleList rules={VFOS_RULES} />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Channel cluster effectiveness */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Cụm kênh hiệu quả"
            subtitle="Doanh thu & CTR theo cụm — chi tiết ở Cụm kênh & Kênh"
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
          <CardBody className="space-y-3">
            {CHANNEL_CLUSTERS.map((cluster) => {
              const totalViews = cluster.channels.length;
              return (
                <div
                  key={cluster.laneId}
                  className="rounded-xl border border-hairline bg-raised/40 p-3.5"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-200">{cluster.name}</span>
                    <LanePill laneId={cluster.laneId} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {cluster.channels.map((ch) => (
                      <div key={ch.platform} className="rounded-lg bg-panel/60 px-2.5 py-2">
                        <PlatformPill platform={ch.platform} />
                        <p className="mt-1.5 text-xs font-semibold text-neutral-100">{ch.views}</p>
                        <p className="text-[10px] text-neutral-500">
                          CTR {ch.ctr} · {ch.revenue}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="sr-only">{totalViews} kênh</p>
                </div>
              );
            })}
          </CardBody>
        </Card>

        {/* Revenue split by lane */}
        <Card>
          <CardHeader
            title="Doanh thu theo ngách"
            subtitle="Tỷ trọng (mock)"
            no={10}
            accentClass="text-accent-green"
          />
          <CardBody className="space-y-3">
            {REVENUE_BY_LANE.map((row) => {
              const lane = LANES.find((l) => l.id === row.laneId);
              return (
                <div key={row.laneId}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-neutral-300">{LANE_LABEL[row.laneId]}</span>
                    <span className={`font-semibold ${ACCENT_TEXT[lane?.accent ?? 'blue']}`}>
                      {row.percent}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-raised">
                    <div
                      className={`h-full rounded-full bg-current ${ACCENT_TEXT[lane?.accent ?? 'blue']}`}
                      style={{ width: `${row.percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <Link href="/analytics">
              <Button variant="outline" className="mt-1 w-full">
                <Icon name="analytics" width={14} height={14} /> Xem Analytics đầy đủ
              </Button>
            </Link>
          </CardBody>
        </Card>
      </div>

      {/* Lane cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {LANES.map((lane) => (
          <Card key={lane.id}>
            <CardBody>
              <LanePill laneId={lane.id} />
              <h3 className="mt-3 text-sm font-semibold text-neutral-100">{lane.label}</h3>
              <p className="mt-1 text-[11px] text-neutral-500">
                Cụm kênh đa nền tảng · nội dung kéo view → gắn affiliate
              </p>
              <Link href="/channels">
                <Button variant="ghost" className="mt-3 !px-0 text-[11px]">
                  Quản lý cụm kênh <UtilIcon name="chevron" width={13} height={13} />
                </Button>
              </Link>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
