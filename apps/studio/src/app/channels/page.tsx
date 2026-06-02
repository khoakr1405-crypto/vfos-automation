import { LanePill, PlatformPill, StatusBadge } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import { UtilIcon } from '@/components/icons';
import { MockBanner } from '@/components/mock-banner';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui';
import { CHANNEL_CLUSTERS, LANES } from '@/lib/mock-data';

export default function ChannelsPage() {
  return (
    <div className="space-y-6">
      <MockBanner />
      <PageHeader
        no={2}
        icon="channels"
        accent="blue"
        title="Cụm kênh & Kênh"
        description="Mỗi ngách là một cụm kênh đa nền tảng. Theo dõi view / CTR / doanh thu từng kênh."
        actions={
          <Button variant="primary">
            <UtilIcon name="plus" /> Thêm cụm kênh
          </Button>
        }
      />

      {/* Lane filter chips (presentational) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-neutral-500">Ngách:</span>
        <Button variant="outline" className="!py-1">
          Tất cả
        </Button>
        {LANES.map((lane) => (
          <span key={lane.id} className="cursor-default">
            <LanePill laneId={lane.id} />
          </span>
        ))}
      </div>

      <div className="space-y-5">
        {CHANNEL_CLUSTERS.map((cluster) => (
          <Card key={cluster.laneId}>
            <CardHeader
              title={cluster.name}
              subtitle="3 kênh · Facebook / TikTok / YouTube"
              right={<LanePill laneId={cluster.laneId} />}
            />
            <CardBody className="!p-0">
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-neutral-600">
                  <tr className="border-b border-hairline">
                    <th className="px-5 py-2.5 font-medium">Kênh</th>
                    <th className="px-5 py-2.5 font-medium">Lượt xem</th>
                    <th className="px-5 py-2.5 font-medium">CTR</th>
                    <th className="px-5 py-2.5 font-medium">Doanh thu</th>
                    <th className="px-5 py-2.5 font-medium">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {cluster.channels.map((ch) => (
                    <tr
                      key={ch.platform}
                      className="border-b border-hairline/60 last:border-0 hover:bg-raised/30"
                    >
                      <td className="px-5 py-3">
                        <PlatformPill platform={ch.platform} />
                      </td>
                      <td className="px-5 py-3 font-semibold text-neutral-100">{ch.views}</td>
                      <td className="px-5 py-3 text-neutral-300">{ch.ctr}</td>
                      <td className="px-5 py-3 text-accent-green">{ch.revenue}</td>
                      <td className="px-5 py-3">
                        <StatusBadge status={ch.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
