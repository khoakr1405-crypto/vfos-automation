import { Card, CardBody, CardHeader } from '@/components/card';
import { EntertainmentStatusPanel } from '@/components/entertainment/status-panel';
import { UtilIcon } from '@/components/icons';
import { MockBanner } from '@/components/mock-banner';
import { OperatorJobQueue } from '@/components/overview/operator-job-queue';
import { OperatorTodo } from '@/components/overview/operator-todo';
import { ProductQueue } from '@/components/overview/product-queue';
import { PageHeader } from '@/components/page-header';
import { ProductReviewStatusPanel } from '@/components/product-review/status-panel';
import { Button, RuleList } from '@/components/ui';
import { VFOS_RULES } from '@/lib/mock-data';
import Link from 'next/link';

/* =============================================================================
 * Tổng quan — UI Architecture V1 Phase A: CHỈ data thật trên màn điều hành.
 * Các panel mock cũ (KPI grid, attention, cluster, weekly, pipeline, readiness,
 * mini analytics) đã GỠ khỏi màn này — số liệu hiệu suất thật (view/click/đơn,
 * M3–M6) sẽ lên màn "Hiệu suất / Analytics" ở Phase E khi có số liệu thật.
 * CTA chính trỏ về lane Command Center, không trỏ route kỹ thuật.
 * ========================================================================== */

// biome-ignore lint/style/noDefaultExport: Next.js page requires default export
export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <MockBanner />

      <PageHeader
        no={1}
        icon="overview"
        accent="blue"
        title="VFOS Operator Overview"
        description="Lane đang chạy: Review Sản phẩm · Chiến lược: content-led affiliate (North Star v2)"
        actions={
          <Link href="/lanes/product-review">
            <Button variant="primary">
              <UtilIcon name="plus" /> Vào lane Review Sản phẩm
            </Button>
          </Link>
        }
      />

      {/* Việc Operator cần làm (Phase 2A) — band đầu Dashboard, gom job cần hành động
          từ 2 lane. READ-ONLY + additive (không thay OperatorJobQueue / status panel). */}
      <OperatorTodo />

      {/* Hàng đợi job thật (registry/manifest) + đường tiếp tục vòng lặp */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <OperatorJobQueue />
        </div>
        <Card className="border-accent-blue/20">
          <CardHeader
            title="Vòng lặp vận hành"
            subtitle="Outcome cuối theo North Star"
            accentClass="text-accent-blue"
          />
          <CardBody className="p-5 text-[11px] leading-relaxed text-neutral-400 space-y-3">
            <p>
              video nguồn → video tiếng Việt đã biên tập → <strong>API publish thật</strong> khi
              Operator duyệt → người xem → click affiliate → đơn hàng/doanh thu thật.
            </p>
            <p className="text-neutral-500">
              Job hoàn tất sẽ hiện panel <strong>"Bắt đầu video mới"</strong> ngay trong lane — job
              cũ tự nằm lại trong hàng đợi/lịch sử, không bị xóa.
            </p>
            <Link href="/lanes/product-review" className="block">
              <Button variant="ghost" className="w-full">
                ▶ Bắt đầu video mới
              </Button>
            </Link>
          </CardBody>
        </Card>
      </div>

      {/* Trạng thái Product Review (PR-A) — bảng điều hành READ-ONLY, thay logic
          /review-status. Ở màn Tổng quan (ngoài LANE NỘI DUNG), tự fetch data thật. */}
      <ProductReviewStatusPanel />

      {/* Trạng thái Entertainment (PR-B) — bảng điều hành READ-ONLY, thay logic
          /ent-status. Ở màn Tổng quan (ngoài LANE NỘI DUNG), tự fetch data thật. */}
      <EntertainmentStatusPanel />

      {/* Hàng đợi sản phẩm thật (Shopee registry) */}
      <ProductQueue />

      {/* Ghi chú phạm vi số liệu — tránh hiểu nhầm vì sao không còn KPI */}
      <Card>
        <CardBody className="flex flex-wrap items-center gap-2 p-4 text-[11px] text-neutral-500">
          <UtilIcon name="bell" width={13} height={13} className="text-accent-amber" />
          <span>
            KPI/hiệu suất (view, click, đơn, doanh thu — M3–M6) sẽ hiển thị ở màn{' '}
            <strong className="text-neutral-300">Hiệu suất / Analytics</strong> khi có số liệu thật.
            Các panel số liệu mock đã được gỡ khỏi Tổng quan theo UI Architecture V1 — không trộn
            mock với data thật trên màn điều hành.
          </span>
        </CardBody>
      </Card>

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
