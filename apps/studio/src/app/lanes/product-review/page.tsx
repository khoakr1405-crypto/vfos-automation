'use client';

/* =============================================================================
 * VFOS Studio — Product Review Command Center (Round A — skeleton, READ-ONLY)
 * -----------------------------------------------------------------------------
 * KHÔNG còn là navigation shell. Đây là Command Center với 3 workflow action
 * panel. Round A chỉ ĐỌC state thật (GET) và hiển thị; mọi nút chạy tác vụ thật
 * đều disabled ("sắp wire ở round sau"). KHÔNG POST, KHÔNG tạo job, KHÔNG render,
 * KHÔNG publish, KHÔNG Shopee extraction, KHÔNG gọi API ngoài.
 *
 * Gate-driven UX: Hành động 2 mở khi có Product Card hợp lệ; Hành động 3 mở khi
 * job mới nhất đã APPROVED. QA là bước con BÊN TRONG Hành động 2 (không tách
 * thành action lớn riêng).
 * ========================================================================== */

import { Card } from '@/components/card';
import { Icon, UtilIcon } from '@/components/icons';
import { MockBanner } from '@/components/mock-banner';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui';
import { ACCENT_BG_SOFT, ACCENT_TEXT, type AccentKey } from '@/lib/nav';
import type { GateState, OperatorJobDTO } from '@/lib/studio-data/types';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

// ---- API response shapes (subset we read) ----------------------------------
interface CardSummary {
  name: string;
  shopId: string;
  itemId: string;
  shortLink: string;
  affiliateOwnerId: string;
  ownerVerified: boolean;
  validationStatus: string;
  score?: number;
  commissionRate?: string;
  price?: string;
  productImageUrl?: string | null;
}
interface CardResponse {
  ok: boolean;
  expectedOwner: string;
  hasCard: boolean;
  card: CardSummary | null;
}
interface SourceDraftResponse {
  ok: boolean;
  draft: {
    updatedAt?: string;
    product: { shortLink: string; shopid: string; itemid: string } | null;
    source: { kind: string; url: string; status: string };
  } | null;
}
interface JobsResponse {
  count: number;
  jobs: OperatorJobDTO[];
}

// ---------------------------------------------------------------------------
export default function ProductReviewLanePage() {
  const [card, setCard] = useState<CardSummary | null>(null);
  const [draft, setDraft] = useState<SourceDraftResponse['draft']>(null);
  const [latestJob, setLatestJob] = useState<OperatorJobDTO | null>(null);
  const [jobCount, setJobCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cardRes, draftRes, jobsRes] = await Promise.allSettled([
        fetch('/api/studio/commerce/current-product-card').then((r) => r.json()),
        fetch('/api/studio/create/source-draft').then((r) => r.json()),
        fetch('/api/studio/jobs').then((r) => r.json()),
      ]);
      if (cardRes.status === 'fulfilled') setCard((cardRes.value as CardResponse).card ?? null);
      if (draftRes.status === 'fulfilled')
        setDraft((draftRes.value as SourceDraftResponse).draft ?? null);
      if (jobsRes.status === 'fulfilled') {
        const body = jobsRes.value as JobsResponse;
        setJobCount(body.count ?? 0);
        setLatestJob(body.jobs?.[0] ?? null); // adapter sorts newest-first
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ---- derived gates -------------------------------------------------------
  const ownerOk = card?.ownerVerified ?? false;
  const cardReady = card !== null && ownerOk;

  // Draft only counts if it belongs to the CURRENT Product Card.
  const draftMatchesCard =
    !!draft?.source?.url &&
    !!card &&
    !!draft.product &&
    (draft.product.shortLink === card.shortLink ||
      (draft.product.shopid === card.shopId && draft.product.itemid === card.itemId));
  const sourceUrl = draftMatchesCard ? (draft?.source?.url ?? null) : null;

  const jobApproved =
    latestJob?.operatorDecision === 'APPROVED' ||
    latestJob?.state === 'APPROVED' ||
    latestJob?.state === 'PACKAGED';

  return (
    <div className="space-y-6">
      <MockBanner />
      <PageHeader
        no={2}
        icon="products"
        accent="amber"
        title="Review Sản phẩm — Command Center"
        description="3 hành động vận hành: lấy sản phẩm → chạy sản xuất video → đăng bài. Bấm 1 nút, hệ thống điều phối chuỗi tác vụ ngầm."
      />

      <div className="flex items-center gap-2 rounded-xl border border-hairline bg-raised/30 px-3.5 py-2 text-[11px] text-neutral-400">
        <UtilIcon name="clock" width={13} height={13} className="text-neutral-500" />
        <span>
          <strong className="text-neutral-300">Round A · Skeleton read-only.</strong> 3 panel đọc
          state thật (Product Card · nguồn nháp · job mới nhất). Các nút chạy tác vụ thật còn{' '}
          <strong className="text-neutral-300">khoá</strong> — sẽ wire ở Round B → E.
        </span>
      </div>

      {/* ===================== HÀNH ĐỘNG 1 ===================== */}
      <ActionPanel
        no={1}
        icon="products"
        accent="amber"
        title="Lấy / chọn sản phẩm"
        desc="Chọn sản phẩm affiliate đúng owner, hoặc lấy link Shopee mới — sẵn sàng thành Product Card."
        status={
          loading
            ? { label: 'Đang tải…', accent: 'blue' }
            : cardReady
              ? { label: 'Product Card sẵn sàng', accent: 'green' }
              : card
                ? { label: 'Sai owner', accent: 'rose' }
                : { label: 'Chưa có Product Card', accent: 'amber' }
        }
      >
        {card ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <div className="flex aspect-square w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-hairline bg-gradient-to-br from-raised to-panel">
              {card.productImageUrl && !imgError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.productImageUrl}
                  alt={card.name}
                  className="h-full w-full object-contain"
                  onError={() => setImgError(true)}
                />
              ) : (
                <Icon name="rawvisual" width={26} height={26} />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-sm font-semibold text-neutral-100">{card.name}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusChip accent={ownerOk ? 'green' : 'rose'}>
                  owner {ownerOk ? 'OK' : 'mismatch'}
                </StatusChip>
                {typeof card.score === 'number' && (
                  <StatusChip accent="cyan">score {card.score}/10</StatusChip>
                )}
                {card.commissionRate && (
                  <StatusChip accent="violet">hoa hồng {card.commissionRate}</StatusChip>
                )}
                {card.price && <StatusChip accent="blue">{card.price}</StatusChip>}
              </div>
              <p className="font-mono text-[10px] text-accent-blue break-all">{card.shortLink}</p>
            </div>
          </div>
        ) : (
          <NoticeBox accent="amber">
            Chưa có Product Card hiện tại. Sẽ chọn/promote ở Hành động 1 (Round B), hoặc xem{' '}
            <DebugLink href="/products?lane=product-review">/products</DebugLink>.
          </NoticeBox>
        )}

        <PanelActions>
          <ComingNext round="B">Chọn từ kho link (no-click)</ComingNext>
          <ComingNext round="B" warn>
            Lấy link Shopee mới (cần confirm phrase)
          </ComingNext>
          <DebugLink href="/products?lane=product-review">Mở kho sản phẩm (debug)</DebugLink>
        </PanelActions>

        <GateHint
          ok={cardReady}
          okText="Product Card hợp lệ → mở Hành động 2"
          waitText="Cần Product Card đúng owner để mở Hành động 2"
        />
      </ActionPanel>

      {/* ===================== HÀNH ĐỘNG 2 ===================== */}
      <ActionPanel
        no={2}
        icon="create"
        accent="violet"
        title="Chạy sản xuất video"
        desc="Dán link video nguồn → 1 nút điều phối: tải/clean nguồn → script → voice → BGM → render → caption → QA → preview."
        status={
          loading
            ? { label: 'Đang tải…', accent: 'blue' }
            : !cardReady
              ? { label: 'Khoá — cần sản phẩm', accent: 'amber' }
              : latestJob
                ? { label: latestJob.statusLabel, accent: latestJob.statusAccent }
                : { label: 'Chưa có job', accent: 'blue' }
        }
        locked={!cardReady}
        lockReason="Hoàn tất Hành động 1 (Product Card hợp lệ) để mở bước sản xuất."
      >
        {/* Nguồn video */}
        <div className="rounded-lg border border-hairline bg-raised/30 p-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            Nguồn video
          </p>
          {sourceUrl ? (
            <p className="font-mono text-[11px] text-neutral-200 break-all">
              <span className="text-accent-green">✓ đã lưu nháp · </span>
              {sourceUrl}
            </p>
          ) : (
            <p className="text-[11px] text-neutral-500">
              Chưa có nguồn nháp cho Product Card hiện tại.
            </p>
          )}
        </div>

        {/* Job mới nhất + pipeline */}
        <div className="rounded-lg border border-hairline bg-raised/30 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              Job mới nhất{' '}
              {jobCount > 0 && <span className="text-neutral-600">· {jobCount} job</span>}
            </p>
            {latestJob && (
              <span className="font-mono text-[10px] text-neutral-500">{latestJob.id}</span>
            )}
          </div>

          {latestJob ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusChip accent={latestJob.statusAccent}>{latestJob.statusLabel}</StatusChip>
                {latestJob.duration !== '—' && (
                  <StatusChip accent="blue">{latestJob.duration}</StatusChip>
                )}
                {latestJob.hasPreview && <StatusChip accent="green">có preview</StatusChip>}
              </div>

              {/* Pipeline steps — QA là bước con cuối, BÊN TRONG Hành động 2 */}
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                <StepRow label="Tải / clean nguồn" state={latestJob.pipeline.source} />
                <StepRow label="Script" state={latestJob.pipeline.script} />
                <StepRow label="Voice" state={latestJob.pipeline.voice} />
                <StepRow label="BGM" state={latestJob.pipeline.bgm} />
                <StepRow label="Render + caption" state={latestJob.pipeline.render} />
                <StepRow label="QA / Kiểm tra" state={latestJob.pipeline.qa} />
              </div>

              {latestJob.errorLog && (
                <NoticeBox accent="rose">Lỗi: {latestJob.errorLog.error}</NoticeBox>
              )}
            </>
          ) : (
            <p className="text-[11px] text-neutral-500">
              Chưa có job nào trong lane. Sẽ tạo + chạy ở Round C/D.
            </p>
          )}
        </div>

        <PanelActions>
          <ComingNext round="C">Lưu nguồn</ComingNext>
          <ComingNext round="D" primary>
            Chạy sản xuất video
          </ComingNext>
          <ComingNext round="D">Xem tiến độ</ComingNext>
        </PanelActions>

        <GateHint
          ok={!!jobApproved}
          okText="Job đã APPROVED → mở Hành động 3"
          waitText="Job cần đạt READY_FOR_OPERATOR_REVIEW + QA PASS rồi Operator duyệt"
        />
      </ActionPanel>

      {/* ===================== HÀNH ĐỘNG 3 ===================== */}
      <ActionPanel
        no={3}
        icon="publish"
        accent="blue"
        title="Đăng bài / Đóng gói"
        desc="Đóng gói video duyệt + caption + affiliate link + CTA, kèm hướng dẫn tự đăng. Live publish Facebook có gate cứng."
        status={
          loading
            ? { label: 'Đang tải…', accent: 'blue' }
            : jobApproved
              ? { label: 'Sẵn sàng đóng gói', accent: 'green' }
              : { label: 'Khoá — chờ duyệt', accent: 'amber' }
        }
        locked={!jobApproved}
        lockReason="Cần job đã APPROVED (QA PASS + Operator duyệt preview) để mở bước đóng gói."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <PackItem
            label="Video đã duyệt"
            ok={!!latestJob?.hasPreview && !!jobApproved}
            mutedText="chờ preview duyệt"
          />
          <PackItem label="Caption / hashtags" ok={false} mutedText="đóng gói ở Round E" />
          <PackItem
            label="Affiliate link hợp lệ"
            ok={latestJob?.pipeline.affiliateLink === 'pass'}
            mutedText="kiểm owner khi đóng gói"
          />
          <PackItem label="CTA multi-touch" ok={false} mutedText="mock — nối sau" />
        </div>

        <PanelActions>
          <ComingNext round="E" primary>
            Đóng gói package
          </ComingNext>
          <ComingNext round="E" warn>
            Live Publish Facebook (gate cứng)
          </ComingNext>
          <DebugLink href="/publish?lane=product-review">Mở publish (debug)</DebugLink>
        </PanelActions>

        <GateHint
          ok={latestJob?.state === 'PACKAGED'}
          okText="Đã đóng gói (PACKAGED) — sẵn sàng đăng thủ công"
          waitText="Hoàn tất khi PACKAGED (thủ công) hoặc PUBLISHED (nếu Operator chủ động live)"
        />
      </ActionPanel>
    </div>
  );
}

/* =============================================================================
 * Local presentational helpers — chỉ dùng trong trang này (không over-abstract).
 * ========================================================================== */

function ActionPanel({
  no,
  icon,
  accent,
  title,
  desc,
  status,
  locked = false,
  lockReason,
  children,
}: {
  no: number;
  icon: 'products' | 'create' | 'publish';
  accent: AccentKey;
  title: string;
  desc: string;
  status: { label: string; accent: AccentKey };
  locked?: boolean;
  lockReason?: string;
  children: ReactNode;
}) {
  return (
    <Card className={locked ? 'opacity-95' : ''}>
      <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
        <div className="flex items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ACCENT_BG_SOFT[accent]}`}
          >
            <Icon name={icon} width={20} height={20} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold tracking-wider text-neutral-500">
                HÀNH ĐỘNG {no}
              </span>
            </div>
            <h2 className="text-sm font-bold text-neutral-100">{title}</h2>
            <p className="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-neutral-500">{desc}</p>
          </div>
        </div>
        <StatusChip accent={status.accent}>{status.label}</StatusChip>
      </div>

      <div className="space-y-3 px-5 py-4">
        {locked && lockReason && (
          <div className="flex items-center gap-2 rounded-lg border border-neutral-700/50 bg-neutral-800/30 px-3 py-2 text-[11px] text-neutral-400">
            <UtilIcon name="clock" width={13} height={13} className="text-neutral-500" />
            <span>
              <strong className="text-neutral-300">Khoá.</strong> {lockReason}
            </span>
          </div>
        )}
        <div className={locked ? 'pointer-events-none select-none opacity-50' : ''}>
          <div className="space-y-3">{children}</div>
        </div>
      </div>
    </Card>
  );
}

function StatusChip({ accent, children }: { accent: AccentKey; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${ACCENT_BG_SOFT[accent]}`}
    >
      {children}
    </span>
  );
}

const GATE_DOT: Record<GateState, string> = {
  pass: 'bg-accent-green',
  fail: 'bg-accent-rose',
  warn: 'bg-neutral-600',
};

function StepRow({ label, state }: { label: string; state: GateState }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-hairline/60 bg-panel/40 px-2.5 py-1.5">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${GATE_DOT[state]}`} />
      <span
        className={`truncate text-[11px] ${state === 'pass' ? 'text-neutral-200' : 'text-neutral-500'}`}
      >
        {label}
      </span>
    </div>
  );
}

function PackItem({ label, ok, mutedText }: { label: string; ok: boolean; mutedText: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-hairline/60 bg-panel/40 px-2.5 py-1.5 text-[11px]">
      <span className={ok ? 'text-neutral-200' : 'text-neutral-500'}>{label}</span>
      {ok ? (
        <span className="flex items-center gap-1 text-accent-green">
          <UtilIcon name="check" width={11} height={11} /> OK
        </span>
      ) : (
        <span className="text-neutral-600">{mutedText}</span>
      )}
    </div>
  );
}

function PanelActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 pt-1">{children}</div>;
}

/** Nút disabled cho hành động chưa wire — nói rõ sẽ làm ở round nào. */
function ComingNext({
  round,
  children,
  primary = false,
  warn = false,
}: {
  round: string;
  children: ReactNode;
  primary?: boolean;
  warn?: boolean;
}) {
  return (
    <Button
      variant={primary ? 'primary' : 'outline'}
      disabled
      title={`Chưa wire — sẽ làm ở Round ${round}`}
      className="!py-1.5 !px-2.5 text-[11px]"
    >
      {warn && <span className="text-accent-amber">⚠</span>}
      {children}
      <span className="ml-1 rounded bg-neutral-700/60 px-1 py-0.5 font-mono text-[9px] text-neutral-400">
        Round {round}
      </span>
    </Button>
  );
}

/** Link nhỏ tới route kỹ thuật cũ — chỉ là debug/detail, không phải flow chính. */
function DebugLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 rounded-lg border border-hairline/60 bg-raised/20 px-2.5 py-1.5 text-[11px] text-neutral-400 transition hover:bg-raised/60 hover:text-neutral-200"
    >
      {children}
      <UtilIcon name="chevron" width={11} height={11} />
    </a>
  );
}

function GateHint({ ok, okText, waitText }: { ok: boolean; okText: string; waitText: string }) {
  const accentText = ok ? ACCENT_TEXT.green : 'text-neutral-500';
  return (
    <div
      className={`flex items-center gap-1.5 border-t border-hairline/50 pt-2.5 text-[11px] ${accentText}`}
    >
      <UtilIcon name={ok ? 'check' : 'clock'} width={12} height={12} />
      <span>{ok ? okText : waitText}</span>
    </div>
  );
}

function NoticeBox({ accent, children }: { accent: 'amber' | 'rose'; children: ReactNode }) {
  const cls =
    accent === 'amber'
      ? 'border-accent-amber/30 bg-accent-amber/10 text-accent-amber'
      : 'border-accent-rose/30 bg-accent-rose/10 text-accent-rose';
  return <div className={`rounded-lg border px-3 py-2 text-[11px] ${cls}`}>{children}</div>;
}
