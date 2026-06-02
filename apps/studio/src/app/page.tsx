import { Card, CardBody, CardHeader } from '@/components/card';
import { Icon, UtilIcon } from '@/components/icons';
import { MockBanner } from '@/components/mock-banner';
import { AttentionPanel } from '@/components/overview/attention-panel';
import { ClusterSummaryCards } from '@/components/overview/cluster-summary-cards';
import { MiniAnalyticsPanel } from '@/components/overview/mini-analytics-panel';
import { OperatorJobQueue } from '@/components/overview/operator-job-queue';
import { OverviewKpiGrid } from '@/components/overview/overview-kpi-grid';
import { PipelineOverview } from '@/components/overview/pipeline-overview';
import { ProductQueue } from '@/components/overview/product-queue';
import { PublishReadinessMini } from '@/components/overview/publish-readiness-mini';
import { WeeklyActivity } from '@/components/overview/weekly-activity';
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
        title="VFOS Operator Overview"
        description="Active Lane: Review sản phẩm · Mode: Product-first affiliate video production"
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

      {/* D. KPI Cards - 7 cards */}
      <OverviewKpiGrid />

      {/* Main Video Jobs Queue (Center of Dashboard) + Attention Alerts */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <OperatorJobQueue />
        </div>
        <AttentionPanel />
      </div>

      {/* Product-First Flow Queue + Publish Readiness Status Matrix */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ProductQueue />
        </div>
        <PublishReadinessMini />
      </div>

      {/* Cụm kênh hiệu quả */}
      <ClusterSummaryCards />

      {/* Lịch hoạt động tuần này */}
      <WeeklyActivity />

      {/* Pipeline Overview */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PipelineOverview />
        </div>
        <div className="flex flex-col justify-between">
          <Card className="h-full flex flex-col justify-center bg-raised/20 border-accent-blue/20">
            <CardBody className="text-center p-6 space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-blue/10 text-accent-blue mx-auto">
                <UtilIcon name="sparkle" width={24} height={24} />
              </div>
              <div>
                <p className="text-sm font-bold text-neutral-100">Affiliate Operator Engine</p>
                <p className="text-xs text-neutral-500 mt-1">
                  Dữ liệu được cập nhật từ data boundary an toàn của VFOS Studio.
                </p>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Mini Analytics */}
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
