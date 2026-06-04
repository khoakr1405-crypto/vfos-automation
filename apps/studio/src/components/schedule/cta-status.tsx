/* =============================================================================
 * VFOS Studio — CTA readiness presentational helpers (Round Affiliate Hub 06)
 * -----------------------------------------------------------------------------
 * Presentational ONLY. Nhận CtaReadinessSummary (transport-safe, KHÔNG raw link)
 * từ growth-data cta-readiness. Dùng ở /schedule: badge gọn trong bảng lịch đăng
 * + checklist thủ công cho Operator guide. KHÔNG fetch, KHÔNG action thật,
 * KHÔNG token. Số CTA tùy ctaMode — KHÔNG ép mọi video 2–3 link.
 * ========================================================================== */

import { Badge } from '@/components/badge';
import type { CtaReadinessSummary } from '@/lib/growth-data/cta-readiness';
import type {
  CtaMode,
  CtaReadiness,
  CtaSlotStatus,
  FacebookHubStatus,
} from '@/lib/growth-data/types';
import type { AccentKey } from '@/lib/nav';

/** ctaMode → nhãn tiếng Việt dễ hiểu cho Operator. */
export const CTA_MODE_LABEL: Record<CtaMode, string> = {
  SINGLE_PRODUCT_REVIEW: 'Review 1 sản phẩm',
  MULTI_TOUCH_NICHE: 'Ngách nhiều CTA',
  CONTEXTUAL_CONTENT: 'Content theo bối cảnh',
};

/** readiness → nhãn badge + accent. */
export const READINESS_META: Record<CtaReadiness, { label: string; accent: AccentKey }> = {
  ready: { label: 'CTA Ready', accent: 'green' },
  partial: { label: 'CTA Partial', accent: 'amber' },
  blocked: { label: 'CTA Blocked', accent: 'rose' },
};

/** facebookHubStatus → nhãn ngắn tiếng Việt. */
const HUB_STATUS_LABEL: Record<FacebookHubStatus, string> = {
  available: 'sẵn sàng',
  unavailable: 'chưa khả dụng',
  unknown: 'chưa rõ',
  manual_required: 'cần gắn tay',
};

const SLOT_STATUS_META: Record<CtaSlotStatus, { label: string; accent: AccentKey }> = {
  ready: { label: 'sẵn sàng', accent: 'green' },
  missing: { label: 'chưa có', accent: 'amber' },
  invalid: { label: 'không hợp lệ', accent: 'rose' },
  not_applicable: { label: 'không áp dụng', accent: 'blue' },
};

/** true khi Operator cần gắn product tag thủ công (manual_required hoặc cờ requiresManualTagging). */
function needsManualTag(summary: CtaReadinessSummary): boolean {
  return summary.requiresManualTagging || summary.facebookHubStatus === 'manual_required';
}

function hubLine(summary: CtaReadinessSummary): string {
  const label = needsManualTag(summary)
    ? 'cần gắn tay'
    : HUB_STATUS_LABEL[summary.facebookHubStatus];
  return `Hub: ${label}`;
}

/** Dòng fallback/cảnh báo tùy readiness — phản ánh chiến lược không ép 2–3 link. */
function fallbackLine(summary: CtaReadinessSummary): string | null {
  if (summary.readiness === 'partial') {
    return summary.facebookHubStatus === 'unavailable'
      ? 'Hub chưa khả dụng — dùng fallback caption/reply'
      : 'Dùng fallback caption/reply';
  }
  if (summary.readiness === 'blocked') return 'Kiểm tra owner/link trước khi đăng';
  const hasFallback = summary.secondaries.some((s) => s.hasLink) || summary.reply.hasLink;
  return hasFallback ? 'Fallback: caption/reply available' : null;
}

/** Badge readiness chuẩn (Ready/Partial/Blocked). */
export function CtaReadinessBadge({ readiness }: { readiness: CtaReadiness }) {
  const meta = READINESS_META[readiness];
  return <Badge accent={meta.accent}>{meta.label}</Badge>;
}

/** Ô CTA gọn trong bảng lịch đăng: badge + mode + hub + fallback. */
export function CtaScheduleCell({ summary }: { summary: CtaReadinessSummary }) {
  const fb = fallbackLine(summary);
  return (
    <div className="space-y-1">
      <CtaReadinessBadge readiness={summary.readiness} />
      <div className="text-[10px] text-neutral-500">Mode: {CTA_MODE_LABEL[summary.ctaMode]}</div>
      <div className="text-[10px] text-neutral-500">{hubLine(summary)}</div>
      {fb && <div className="text-[10px] text-neutral-600">{fb}</div>}
    </div>
  );
}

/** Ô khi posting plan chưa gắn jobId / chưa có AffiliateCtaPlan. KHÔNG chặn schedule core. */
export function NoCtaPlanCell() {
  return (
    <div className="space-y-1">
      <Badge accent="blue">CTA: Chưa có plan</Badge>
      <div className="text-[10px] text-neutral-600">
        Không chặn schedule core — cần kiểm tra trước khi publish
      </div>
    </div>
  );
}

/** Checklist thủ công 4 vai trò CTA + cờ gắn tay (cho Operator guide). */
export function CtaChecklist({ summary }: { summary: CtaReadinessSummary }) {
  const caption = summary.secondaries.find((s) => s.role === 'CAPTION_LINK');
  const pinned = summary.secondaries.find((s) => s.role === 'PINNED_COMMENT');

  const items: Array<{ label: string; status: CtaSlotStatus; hint?: string }> = [
    { label: 'Primary Hub CTA', status: summary.primary.status },
    {
      label: 'Caption link',
      status: caption?.status ?? 'not_applicable',
      hint: caption ? undefined : 'optional theo mode',
    },
    {
      label: 'Pinned comment link',
      status: pinned?.status ?? 'not_applicable',
      hint: pinned ? undefined : 'optional theo mode',
    },
    { label: 'Reply CTA policy', status: summary.reply.status, hint: 'intent-gated' },
  ];

  return (
    <div className="space-y-1.5">
      {items.map((it) => {
        const meta = SLOT_STATUS_META[it.status];
        return (
          <div key={it.label} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-neutral-400">{it.label}</span>
            <span className="flex items-center gap-1.5">
              {it.hint && <span className="text-[10px] text-neutral-600">{it.hint}</span>}
              <Badge accent={meta.accent}>{meta.label}</Badge>
            </span>
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-neutral-400">Manual product tag needed</span>
        <Badge accent={summary.requiresManualTagging ? 'amber' : 'green'}>
          {summary.requiresManualTagging ? 'Cần gắn tay' : 'Không cần'}
        </Badge>
      </div>
    </div>
  );
}
