import { Card, CardBody } from '@/components/card';
import { UtilIcon } from '@/components/icons';
import { MockBanner } from '@/components/mock-banner';
import { PageHeader } from '@/components/page-header';
import { PublishCommandCenter } from '@/components/publish/publish-command-center';
import { PublishSchedulePreview } from '@/components/publish/publish-schedule-preview';
import { PublishSummaryKpis } from '@/components/publish/publish-summary-kpis';
import { PublishWarningsPanel } from '@/components/publish/publish-warnings-panel';
import { Button } from '@/components/ui';
import Link from 'next/link';

export default function PublishPage() {
  return (
    <div className="space-y-6">
      <MockBanner />

      <PageHeader
        no={9}
        icon="publish"
        accent="green"
        title="Xuất bản & Lịch"
        description="Publish Command Center — duyệt thủ công, gate riêng từng nội dung, publish từng nền tảng."
        actions={
          <Link href="/schedule">
            <Button variant="ghost">
              <UtilIcon name="clock" width={14} height={14} /> Lịch đa nền tảng
            </Button>
          </Link>
        }
      />

      {/* Gate reminder */}
      <Card>
        <CardBody className="flex flex-wrap items-center gap-2 text-[11px] text-accent-amber">
          <UtilIcon name="bell" width={14} height={14} />
          <span>
            <strong>Gate bảo vệ:</strong> chỉ publish khi nội dung đã QA PASS + được operator duyệt
            + link đúng owner + package/thumbnail sẵn sàng. Một nền tảng READY không có nghĩa nền
            tảng khác READY. KHÔNG có publish tự động.
          </span>
        </CardBody>
      </Card>

      {/* A. Summary KPI */}
      <PublishSummaryKpis />

      {/* B + C + D + E — queue, chi tiết, card từng nền tảng, gate checklist */}
      <PublishCommandCenter />

      {/* F. Schedule preview + G. Warnings */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PublishSchedulePreview />
        </div>
        <PublishWarningsPanel />
      </div>
    </div>
  );
}
