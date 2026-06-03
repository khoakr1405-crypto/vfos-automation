import type { CtaReadinessSummary, CtaSlotSummary } from '@/lib/growth-data/cta-readiness';
import type {
  CtaMode,
  CtaReadiness,
  CtaSlotStatus,
  FacebookHubStatus,
} from '@/lib/growth-data/types';
import type { AccentKey } from '@/lib/nav';
import { Badge } from '../badge';
import { Card, CardBody, CardHeader } from '../card';
import { UtilIcon } from '../icons';

const READINESS_META: Record<CtaReadiness, { label: string; accent: AccentKey }> = {
  ready: { label: 'Sẵn sàng', accent: 'green' },
  partial: { label: 'Một phần', accent: 'amber' },
  blocked: { label: 'Bị chặn', accent: 'rose' },
};

const MODE_META: Record<CtaMode, { label: string; hint: string }> = {
  SINGLE_PRODUCT_REVIEW: {
    label: 'Review 1 sản phẩm',
    hint: 'Video review 1 sản phẩm: 1 link chính là đủ — không bắt buộc link phụ.',
  },
  MULTI_TOUCH_NICHE: {
    label: 'Ngách multi-touch',
    hint: 'Ngách nhiều sản phẩm: nên có Primary + ít nhất 1 link phụ (caption/comment ghim).',
  },
  CONTEXTUAL_CONTENT: {
    label: 'Content bối cảnh',
    hint: 'Ưu tiên sản phẩm hợp ngữ cảnh video; link phụ tùy chọn theo nội dung.',
  },
};

const HUB_META: Record<FacebookHubStatus, string> = {
  available: 'Facebook Affiliate Hub khả dụng',
  unavailable: 'Hub chưa khả dụng → fallback dùng link caption/comment',
  unknown: 'Trạng thái Hub chưa rõ',
  manual_required: 'Hub cần thao tác tay từ Operator',
};

const SLOT_META: Record<CtaSlotStatus, { label: string; dot: string; text: string }> = {
  ready: {
    label: 'Sẵn sàng',
    dot: 'bg-accent-green/20 text-accent-green',
    text: 'text-accent-green',
  },
  missing: {
    label: 'Chưa có',
    dot: 'bg-accent-amber/20 text-accent-amber',
    text: 'text-accent-amber',
  },
  invalid: {
    label: 'Không hợp lệ',
    dot: 'bg-accent-rose/20 text-accent-rose',
    text: 'text-accent-rose',
  },
  not_applicable: {
    label: 'Không áp dụng',
    dot: 'bg-neutral-800 text-neutral-500',
    text: 'text-neutral-500',
  },
};

function SlotIcon({ status }: { status: CtaSlotStatus }) {
  if (status === 'ready') return <UtilIcon name="check" width={11} height={11} />;
  if (status === 'invalid') return <UtilIcon name="x" width={11} height={11} />;
  if (status === 'missing') return <span className="text-[11px] font-bold leading-none">!</span>;
  return <span className="text-[11px] font-bold leading-none">–</span>;
}

function CtaRow({
  label,
  sublabel,
  slot,
  fixedNote,
}: {
  label: string;
  sublabel: string;
  slot: CtaSlotSummary;
  fixedNote?: string;
}) {
  const meta = SLOT_META[slot.status];
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-hairline bg-raised/40 px-3 py-2">
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${meta.dot}`}
        >
          <SlotIcon status={slot.status} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] text-neutral-200">{label}</p>
          <p className="text-[10px] text-neutral-500">{sublabel}</p>
          {slot.note && <p className="mt-0.5 text-[10px] text-accent-amber">{slot.note}</p>}
          {fixedNote && <p className="mt-0.5 text-[10px] text-neutral-500">{fixedNote}</p>}
        </div>
      </div>
      <span className={`shrink-0 text-[10px] font-semibold ${meta.text}`}>{meta.label}</span>
    </div>
  );
}

function naSlot(role: CtaSlotSummary['role']): CtaSlotSummary {
  return { role, status: 'not_applicable', hasLink: false, note: null };
}

/**
 * Round Affiliate Hub 03 — CTA Readiness card cho job đang chọn ở /publish.
 * Hiển thị 4 vai trò: Primary (Hub native) · Caption link · Pinned comment · Reply CTA.
 * Readiness tùy ctaMode (review 1 sản phẩm không cần link phụ). Read-only, không publish.
 */
export function CtaReadinessCard({ summary }: { summary?: CtaReadinessSummary | null }) {
  if (!summary) {
    return (
      <Card>
        <CardHeader
          title="CTA Readiness — Affiliate Hub & link phụ"
          subtitle="Chưa có kế hoạch CTA (AffiliateCtaPlan) cho job này"
          accentClass="text-accent-amber"
        />
        <CardBody>
          <p className="text-[11px] text-neutral-500">
            Job chưa gắn AffiliateCtaPlan. Mặc định vẫn dùng affiliate link trong caption/comment
            khi người xem hỏi link/giá/mua — theo policy Comment Intelligence (intent-gated).
          </p>
        </CardBody>
      </Card>
    );
  }

  const mode = MODE_META[summary.ctaMode];
  const readiness = READINESS_META[summary.readiness];
  const caption =
    summary.secondaries.find((s) => s.role === 'CAPTION_LINK') ?? naSlot('CAPTION_LINK');
  const pinned =
    summary.secondaries.find((s) => s.role === 'PINNED_COMMENT') ?? naSlot('PINNED_COMMENT');

  return (
    <Card>
      <CardHeader
        title="CTA Readiness — Affiliate Hub & link phụ"
        subtitle={`Chiến lược: ${mode.label}`}
        no={9}
        accentClass="text-accent-green"
        right={<Badge accent={readiness.accent}>{readiness.label}</Badge>}
      />
      <CardBody className="space-y-2">
        <CtaRow
          label="Primary CTA · Facebook Affiliate Hub (native)"
          sublabel="Sản phẩm chính — product tag/banner native nếu page hỗ trợ"
          slot={summary.primary}
        />
        <CtaRow
          label="Link phụ · Caption"
          sublabel="Affiliate link trong caption video"
          slot={caption}
        />
        <CtaRow
          label="Link phụ · Comment ghim"
          sublabel="Affiliate link ở comment ghim"
          slot={pinned}
        />
        <CtaRow
          label="Reply CTA · trả lời bình luận"
          sublabel="Dùng khi người xem hỏi link/giá/mua đâu"
          slot={summary.reply}
          fixedNote="Intent-gated: Comment Intelligence quyết định có gắn link hay không — không gắn cho comment vui/khen/khiếu nại/so sánh."
        />

        <div className="space-y-1 pt-1">
          <p className="flex items-center gap-1.5 text-[10px] text-neutral-500">
            <UtilIcon name="link" width={11} height={11} className="shrink-0 text-accent-blue" />
            {HUB_META[summary.facebookHubStatus]}
          </p>
          <p className="text-[10px] text-neutral-500">{mode.hint}</p>
          {summary.requiresManualTagging && (
            <p className="flex items-center gap-1.5 text-[10px] text-accent-amber">
              <UtilIcon name="bell" width={11} height={11} className="shrink-0" />
              Cần Operator gắn product tag thủ công trên Facebook.
            </p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
