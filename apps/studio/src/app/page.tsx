import { Card, CardBody, CardHeader } from '@/components/card';
import { Icon, UtilIcon } from '@/components/icons';
import { MockBanner } from '@/components/mock-banner';
import { AttentionPanel } from '@/components/overview/attention-panel';
import { ClusterSummaryCards } from '@/components/overview/cluster-summary-cards';
import { MiniAnalyticsPanel } from '@/components/overview/mini-analytics-panel';
import { OverviewKpiGrid } from '@/components/overview/overview-kpi-grid';
import { PipelineOverview } from '@/components/overview/pipeline-overview';
import { PublishReadinessMini } from '@/components/overview/publish-readiness-mini';
import { RecentContentTable } from '@/components/overview/recent-content-table';
import { PageHeader } from '@/components/page-header';
import { Button, RuleList } from '@/components/ui';
import { VFOS_RULES } from '@/lib/mock-data';
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
        description="Màn hình điều hành VFOS — sản xuất & xuất bản video affiliate đa kênh (Facebook · TikTok · YouTube)"
        actions={
          <>
            <Link href="/analytics">
              <Button variant="ghost">
                <Icon name="analytics" width={14} height={14} /> Analytics
              </Button>
            </Link>
            <Link href="/create">
              <Button variant="primary">
                <UtilIcon name="plus" /> Tạo nội dung
              </Button>
            </Link>
          </>
        }
      />

      {/* A. KPI Summary */}
      <OverviewKpiGrid />

      {/* B. Cụm kênh hiệu quả */}
      <ClusterSummaryCards />

      {/* D. Nội dung gần đây  +  C. Việc cần chú ý */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentContentTable />
        </div>
        <AttentionPanel />
      </div>

      {/* G. Pipeline Overview  +  E. Publish Readiness */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PipelineOverview />
        </div>
        <PublishReadinessMini />
      </div>

      {/* F. Mini Analytics */}
      <MiniAnalyticsPanel />

      {/* Rule vận hành VFOS — luôn hiển thị để tránh hiểu nhầm */}
      <Card>
        <CardHeader
          title="Rule vận hành bắt buộc"
          subtitle="Áp dụng cho toàn bộ pipeline VFOS"
          accentClass="text-accent-green"
        />
        <CardBody>
          <RuleList rules={VFOS_RULES} />
        </CardBody>
      </Card>
    </div>
  );
}
