import { LanePill } from '@/components/badge';
import { ChannelsSection } from '@/components/channels/channels-section';
import { ContentAnglesSection } from '@/components/channels/content-angles-section';
import { UtilIcon } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui';
import { loadChannels, loadContentAngles } from '@/lib/growth-data/load';
import { LANES } from '@/lib/mock-data';

// Đọc Growth data thật (filesystem fixtures) ở mỗi request — không prerender tĩnh.
export const dynamic = 'force-dynamic';

export default async function ChannelsPage() {
  const channels = loadChannels();
  const angles = loadContentAngles();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 rounded-xl border border-accent-blue/30 bg-accent-blue/10 px-3.5 py-2 text-[11px] text-accent-blue">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-blue" />
        <span>
          <strong>Growth 03 · READ-ONLY.</strong> Kênh & Content Angle đọc <strong>thật</strong> qua
          growth-data adapter (Growth fixtures seed). Chưa gọi Meta API, chưa publish; quyền page
          chỉ hiển thị trạng thái boolean, không lộ giá trị xác thực.
        </span>
      </div>

      <PageHeader
        no={2}
        icon="channels"
        accent="blue"
        title="Cụm kênh & Kênh"
        description="Quản lý kênh/page theo ngách + content angle. Nguồn: Growth data adapter (read-only)."
        actions={
          <Button variant="primary">
            <UtilIcon name="plus" /> Thêm kênh
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

      <ChannelsSection channels={channels} />
      <ContentAnglesSection angles={angles} />
    </div>
  );
}
