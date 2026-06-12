import { ChannelsSection } from '@/components/channels/channels-section';
import { ContentAnglesSection } from '@/components/channels/content-angles-section';
import { PageHeader } from '@/components/page-header';
import { loadChannelsWithSource, loadContentAngles } from '@/lib/growth-data/load';

// Đọc channel config thật ở mỗi request — không prerender tĩnh.
export const dynamic = 'force-dynamic';

// biome-ignore lint/style/noDefaultExport: Next.js page requires default export
export default async function ChannelsPage() {
  const { channels, source } = loadChannelsWithSource();
  const angles = loadContentAngles();
  const realSource = source === 'real';

  return (
    <div className="space-y-6">
      <div
        className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[11px] ${
          realSource
            ? 'border-accent-green/30 bg-accent-green/10 text-accent-green'
            : 'border-accent-amber/30 bg-accent-amber/10 text-accent-amber'
        }`}
      >
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${realSource ? 'bg-accent-green' : 'bg-accent-amber'}`}
        />
        <span>
          {realSource ? (
            <>
              <strong>NGUỒN THẬT · READ-ONLY.</strong> Kênh đọc từ{' '}
              <strong>config/channels.json</strong> (UI Architecture V1 Phase D). Quyền page chỉ là
              boolean hiện diện env — không lộ giá trị token. Chưa gọi Meta API, chưa publish từ màn
              này.
            </>
          ) : (
            <>
              <strong>FIXTURE DEMO · READ-ONLY.</strong> config/channels.json trống — đang hiển thị
              fixture demo. Thêm kênh thật vào config/channels.json để chuyển sang nguồn thật.
            </>
          )}
        </span>
      </div>

      <PageHeader
        no={4}
        icon="channels"
        accent="blue"
        title="Ngách & Kênh"
        description="Cấu trúc Niche → Channel theo North Star. Thêm/sửa kênh = Operator sửa config/channels.json (không có nút ghi từ UI — màn này read-only)."
      />

      <ChannelsSection channels={channels} />
      <ContentAnglesSection angles={angles} />
    </div>
  );
}
