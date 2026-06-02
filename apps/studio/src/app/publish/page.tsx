import { PlatformPill, StatusBadge } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import { Icon, UtilIcon } from '@/components/icons';
import { MockBanner } from '@/components/mock-banner';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui';
import { PLATFORM_LABEL, PUBLISH_MATRIX, PUBLISH_PACKAGES } from '@/lib/mock-data';

export default function PublishPage() {
  return (
    <div className="space-y-6">
      <MockBanner />
      <PageHeader
        no={9}
        icon="publish"
        accent="green"
        title="Xuất bản & Lịch"
        description="Chỉ xuất bản nội dung đã được duyệt. Publish từng nền tảng riêng — KHÔNG tự động."
      />

      <Card>
        <CardBody className="flex items-center gap-2 text-[11px] text-accent-amber">
          <UtilIcon name="bell" width={14} height={14} />
          Gate bảo vệ: chỉ xuất bản khi đã được duyệt. Mỗi nút publish là một hành động thủ công
          riêng.
        </CardBody>
      </Card>

      {/* Publish matrix */}
      <Card>
        <CardHeader
          title="Publish matrix"
          subtitle="Trạng thái xuất bản theo nền tảng"
          no={9}
          accentClass="text-accent-green"
        />
        <CardBody className="!p-0">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-neutral-600">
              <tr className="border-b border-hairline">
                <th className="px-5 py-2.5 font-medium">Nền tảng</th>
                <th className="px-5 py-2.5 font-medium">Kênh</th>
                <th className="px-5 py-2.5 font-medium">Lịch đăng</th>
                <th className="px-5 py-2.5 font-medium">Trạng thái</th>
                <th className="px-5 py-2.5 text-right font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {PUBLISH_MATRIX.map((row) => (
                <tr
                  key={row.jobId}
                  className="border-b border-hairline/60 last:border-0 hover:bg-raised/30"
                >
                  <td className="px-5 py-3">
                    <PlatformPill platform={row.platform} />
                  </td>
                  <td className="px-5 py-3 text-neutral-200">{row.channel}</td>
                  <td className="px-5 py-3 text-neutral-400">{row.scheduledAt}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button
                      variant={row.status === 'ready' ? 'success' : 'outline'}
                      disabled={row.status !== 'ready'}
                    >
                      <Icon name="publish" width={13} height={13} /> Publish{' '}
                      {PLATFORM_LABEL[row.platform].split(' ')[0]}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {/* Per-platform publish + packages */}
      <div className="grid gap-5 lg:grid-cols-3">
        {PUBLISH_PACKAGES.map((pkg) => (
          <Card key={pkg.platform}>
            <CardHeader
              title={PLATFORM_LABEL[pkg.platform]}
              subtitle="Gói xuất bản (mock)"
              accentClass="text-accent-green"
              right={<PlatformPill platform={pkg.platform} />}
            />
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-hairline bg-raised/40 px-3 py-2">
                <span className="font-mono text-[11px] text-neutral-300">{pkg.file}</span>
                <span className="text-[10px] text-neutral-500">{pkg.size}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline">
                  <UtilIcon name="download" width={13} height={13} /> Tải về
                </Button>
                <Button variant="success">
                  <Icon name="publish" width={13} height={13} /> Publish
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
