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
 *
 * Taste v2 — "tóm tắt trước, ẩn chi tiết": số/chip tóm tắt luôn hiện, bảng dày +
 * list job + rule GẬP bằng <details> native (mở khi cần) → trang ngắn, có tầng bậc.
 * Chỉ Tailwind/DOM — KHÔNG đổi data/fetch/state.
 * ========================================================================== */

/** Nhãn phân vùng editorial — chữ nhỏ tracking rộng + hairline kéo hết hàng. */
function SectionLabel({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-600">
        {children}
      </span>
      <span className="h-px flex-1 bg-hairline/60" aria-hidden />
    </div>
  );
}

// Chuỗi outcome North Star — render dạng chain dọc gọn (thay đoạn văn dài).
const LOOP_STEPS = [
  { label: 'video nguồn', tone: 'bg-neutral-600', emphasis: false },
  { label: 'video tiếng Việt đã biên tập', tone: 'bg-neutral-600', emphasis: false },
  { label: 'API publish thật khi Operator duyệt', tone: 'bg-accent-amber', emphasis: true },
  { label: 'người xem → click affiliate', tone: 'bg-neutral-600', emphasis: false },
  { label: 'đơn hàng / doanh thu thật', tone: 'bg-accent-green', emphasis: true },
] as const;

// biome-ignore lint/style/noDefaultExport: Next.js page requires default export
export default function OverviewPage() {
  return (
    <div className="space-y-8">
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
              <Button
                variant="primary"
                className="transition-all duration-300 ease-in-out active:scale-[0.98]"
              >
                <UtilIcon name="plus" /> Vào lane Review Sản phẩm
              </Button>
            </Link>
          }
        />
      </div>

      {/* Việc Operator cần làm — band tóm tắt (tile luôn hiện, list chi tiết gập). */}
      <section className="space-y-4">
        <SectionLabel>Cần xử lý ngay</SectionLabel>
        <OperatorTodo />
      </section>

      {/* Hàng đợi job thật (registry/manifest) + đường tiếp tục vòng lặp. */}
      <section className="space-y-4">
        <SectionLabel>Hàng đợi & vòng lặp vận hành</SectionLabel>
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
            <CardBody className="space-y-4">
              <ol className="space-y-2.5 border-l border-hairline pl-4 text-[11px] leading-relaxed text-neutral-400">
                {LOOP_STEPS.map((s) => (
                  <li key={s.label} className="relative">
                    <span
                      className={`absolute top-1.5 -left-[20.5px] h-2 w-2 rounded-full ${s.tone}`}
                      aria-hidden
                    />
                    <span className={s.emphasis ? 'font-medium text-neutral-200' : undefined}>
                      {s.label}
                    </span>
                  </li>
                ))}
              </ol>
              <Link href="/lanes/product-review" className="block">
                <Button
                  variant="ghost"
                  className="w-full border border-hairline/60 transition-all duration-300 ease-in-out hover:border-hairline active:scale-[0.98]"
                >
                  <UtilIcon name="play" width={12} height={12} /> Bắt đầu video mới
                </Button>
              </Link>
            </CardBody>
          </Card>
        </div>
      </section>

      {/* Trạng thái Product Review (PR-A) + Entertainment (PR-B) — READ-ONLY, thay
          logic /review-status + /ent-status. Bảng chi tiết gập trong từng panel. */}
      <section className="space-y-4">
        <SectionLabel>Trạng thái lane</SectionLabel>
        <ProductReviewStatusPanel />
        <EntertainmentStatusPanel />
      </section>

      {/* Hàng đợi sản phẩm thật (Shopee registry) */}
      <section className="space-y-4">
        <SectionLabel>Nguồn sản phẩm Shopee</SectionLabel>
        <ProductQueue />
      </section>

      {/* Ghi chú phạm vi số liệu — footnote 1 dòng, tránh hiểu nhầm vì sao không có KPI. */}
      <p className="flex items-center gap-2 border-l-2 border-accent-amber/50 py-0.5 pl-4 text-[11px] text-neutral-500">
        <UtilIcon name="bell" width={12} height={12} className="shrink-0 text-accent-amber" />
        KPI hiệu suất (view · click · đơn · doanh thu) sẽ lên màn{' '}
        <strong className="text-neutral-300">Hiệu suất / Analytics</strong> khi có số liệu thật.
      </p>

      {/* Rule vận hành VFOS — gập bằng <details> native (mở khi cần), không thêm state. */}
      <details className="group rounded-2xl border border-hairline bg-card/80 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-transparent px-5 py-4 transition-colors duration-300 group-open:border-hairline [&::-webkit-details-marker]:hidden">
          <div className="flex items-center gap-3">
            <span className="h-3.5 w-1 shrink-0 rounded-full bg-current text-accent-green" />
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-neutral-100">
                Rule vận hành bắt buộc
              </h2>
              <p className="mt-0.5 text-xs text-neutral-500">Áp dụng cho toàn bộ pipeline VFOS</p>
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-neutral-500">
            <span className="group-open:hidden">Xem rule</span>
            <span className="hidden group-open:inline">Ẩn</span>
            <UtilIcon
              name="chevron"
              width={12}
              height={12}
              className="transition-transform duration-300 ease-in-out group-open:rotate-90"
            />
          </span>
        </summary>
        <div className="px-5 py-4">
          <RuleList rules={VFOS_RULES} />
        </div>
      </details>
    </div>
  );
}
