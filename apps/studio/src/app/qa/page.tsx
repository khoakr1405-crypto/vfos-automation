import { Card, CardBody } from '@/components/card';
import { Icon, UtilIcon } from '@/components/icons';
import { MockBanner } from '@/components/mock-banner';
import { PageHeader } from '@/components/page-header';
import { QaCommandCenter } from '@/components/qa/qa-command-center';
import { QaSummaryKpis } from '@/components/qa/qa-summary-kpis';
import { Button } from '@/components/ui';
import Link from 'next/link';

export default function QaPage() {
  return (
    <div className="space-y-6">
      <MockBanner />

      <PageHeader
        no={8}
        icon="qa"
        accent="green"
        title="QA & Duyệt"
        description="QA Review Command Center — kiểm kỹ thuật + nội dung + affiliate + platform, rồi operator duyệt."
        actions={
          <Link href="/publish">
            <Button variant="ghost">
              <Icon name="publish" width={14} height={14} /> Sang Xuất bản
            </Button>
          </Link>
        }
      />

      {/* Rule reminder */}
      <Card>
        <CardBody className="flex flex-wrap items-center gap-2 text-[11px] text-accent-amber">
          <UtilIcon name="bell" width={14} height={14} />
          <span>
            <strong>Gate QA:</strong> QA bắt buộc PASS → operator duyệt → mới sang publish. QA FAIL
            / sai owner / thiếu package thì khóa duyệt. Voice là chính, BGM không được lấn voice.
          </span>
        </CardBody>
      </Card>

      {/* A. Summary KPI */}
      <QaSummaryKpis />

      {/* B–I — queue, chi tiết, checklist, readiness, operator decision, findings */}
      <QaCommandCenter />
    </div>
  );
}
