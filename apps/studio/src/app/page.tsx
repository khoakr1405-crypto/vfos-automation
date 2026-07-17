import { Card, CardBody, CardHeader } from '@/components/card';
import { EntertainmentStatusPanel } from '@/components/entertainment/status-panel';
import { UtilIcon } from '@/components/icons';
import { MockBanner } from '@/components/mock-banner';
import { DailyRhythmStrip } from '@/components/overview/daily-rhythm-strip';
import { LaneStatusTiles } from '@/components/overview/lane-status-tiles';
import { OperatorJobQueue } from '@/components/overview/operator-job-queue';
import { OperatorTodo } from '@/components/overview/operator-todo';
import { OverviewKpiRow } from '@/components/overview/overview-kpi-row';
import { ProcessStrip } from '@/components/overview/process-strip';
import { ProductQueue } from '@/components/overview/product-queue';
import { PageHeader } from '@/components/page-header';
import { ProductReviewStatusPanel } from '@/components/product-review/status-panel';
import { Button, RuleList } from '@/components/ui';
import { VFOS_RULES } from '@/lib/mock-data';
import Link from 'next/link';

/* =============================================================================
 * Tổng quan — Operator Overview (redesign concept 07/2026, Mega-Phase P1–P4).
 *
 * Bố cục concept: KPI row → (Công việc ưu tiên | Trạng thái lane) → Quy trình
 * chuẩn → "Xem toàn bộ chi tiết" (gập hàng đợi/panel/nguồn để màn chính thoáng).
 *
 * NO-GO #6: mọi ô tiền/hiệu suất KHÔNG có nguồn thật đều là empty-state
 * (OverviewKpiRow ô "Hiệu suất chung" = N/A). ZERO LOGIC CHANGE: chỉ khoác áo +
 * tái bố cục — mọi fetch/state của component con giữ nguyên vẹn.
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

// Chuỗi outcome North Star — render dạng chain dọc gọn.
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

      {/* Hàng KPI đầu trang — 4 ô số thật + ô Hiệu suất empty-state (No-Go #6). */}
      <section className="space-y-4">
        <SectionLabel>Toàn cảnh vận hành</SectionLabel>
        <OverviewKpiRow />
      </section>

      {/* 2 cột concept: Công việc ưu tiên (trái) | Trạng thái lane (phải). */}
      <section className="space-y-4">
        <div className="grid gap-5 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionLabel>Công việc ưu tiên</SectionLabel>
            <div className="mt-4">
              <OperatorTodo />
            </div>
          </div>
          <div className="lg:col-span-7">
            <SectionLabel>Trạng thái lane</SectionLabel>
            <div className="mt-4">
              <LaneStatusTiles />
            </div>
          </div>
        </div>
      </section>

      {/* Dải quy trình vận hành chuẩn — nhãn 6 bước, không số. */}
      <section className="space-y-4">
        <SectionLabel>Quy trình vận hành chuẩn</SectionLabel>
        <ProcessStrip />
      </section>

      {/* Nhịp sản xuất hôm nay (Phase 2 Slice A) — kéo nhịp batch cohort mới nhất
          lên màn chính, always-visible; lịch sử đầy đủ vẫn trong <details> dưới. */}
      <section className="space-y-4">
        <SectionLabel>Nhịp sản xuất hôm nay</SectionLabel>
        <DailyRhythmStrip />
      </section>

      {/* Gom chi tiết (P3) — hàng đợi job · panel trạng thái chi tiết · nguồn SP ·
          vòng lặp — gập vào <details> để màn chính thoáng như concept. Mọi
          component giữ nguyên fetch/state, chỉ đổi vị trí. */}
      <details className="group rounded-2xl border border-hairline bg-card/60 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <div className="flex items-center gap-3">
            <span className="h-3.5 w-1 shrink-0 rounded-full bg-accent-blue shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-400">
                Xem toàn bộ chi tiết vận hành
              </h2>
              <p className="mt-0.5 text-xs text-neutral-500">
                Hàng đợi job · trạng thái lane chi tiết · nguồn sản phẩm · vòng lặp North Star
              </p>
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-neutral-400 transition-colors duration-300 group-open:text-neutral-200">
            <span className="group-open:hidden">Mở rộng</span>
            <span className="hidden group-open:inline">Thu gọn</span>
            <UtilIcon
              name="chevron"
              width={12}
              height={12}
              className="transition-transform duration-300 ease-in-out group-open:rotate-90"
            />
          </span>
        </summary>

        <div className="space-y-6 border-t border-hairline/70 px-5 py-5">
          {/* Hàng đợi job thật + vòng lặp vận hành. */}
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

          {/* Trạng thái lane chi tiết (bảng neon read-only). */}
          <ProductReviewStatusPanel />
          <EntertainmentStatusPanel />

          {/* Nguồn sản phẩm thật (Shopee registry). */}
          <ProductQueue />
        </div>
      </details>

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
