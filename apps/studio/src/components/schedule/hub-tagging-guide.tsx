/* =============================================================================
 * VFOS Studio — Facebook Hub tagging manual guide (Round Affiliate Hub 06)
 * -----------------------------------------------------------------------------
 * READ-ONLY Operator guide. Hướng dẫn gắn Facebook Affiliate Hub / native product
 * tag THỦ CÔNG + checklist CTA theo job đang có lịch. KHÔNG gọi Facebook/Meta API,
 * KHÔNG browser automation, KHÔNG tự gắn tag, KHÔNG publish/reply. Chỉ hiển thị.
 * ========================================================================== */

import { Badge } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import type { CtaReadinessSummary } from '@/lib/growth-data/cta-readiness';
import type { CtaMode } from '@/lib/growth-data/types';
import { CTA_MODE_LABEL, CtaChecklist, READINESS_META } from './cta-status';

/** Các bước gắn Facebook Hub/native product tag thủ công cho Operator. */
const STEPS: string[] = [
  'Kiểm tra video/job đã có AffiliateCtaPlan (xem badge CTA ở bảng lịch đăng).',
  'Xác định Primary Hub CTA là sản phẩm chính của video.',
  'Mở Facebook app/web bằng tài khoản/page phù hợp.',
  'Tạo Reel/Post theo quy trình thủ công như bình thường.',
  'Trong phần Monetization/Affiliate/Product link, chọn hoặc dán sản phẩm Shopee Affiliate tương ứng.',
  'Kiểm tra product banner/native CTA đã hiển thị nếu Facebook hỗ trợ.',
  'Nếu Hub chưa khả dụng, dùng fallback: caption link → pinned comment link → Reply CTA qua Comment Intelligence khi người xem hỏi link/giá/mua đâu.',
  'KHÔNG gắn link vào comment complaint / chê / so sánh sản phẩm.',
  'Sau khi đăng, Operator có thể cập nhật postId/status ở round khác nếu cần.',
];

/** Mô tả ngắn kỳ vọng CTA theo từng mode (giữ đúng chiến lược: không ép 2–3 link). */
const MODE_NOTES: Array<[CtaMode, string]> = [
  ['SINGLE_PRODUCT_REVIEW', '1 Primary CTA hợp lệ là đủ'],
  ['MULTI_TOUCH_NICHE', 'Primary + secondary/reply'],
  ['CONTEXTUAL_CONTENT', 'Linh hoạt theo bối cảnh'],
];

export function HubTaggingGuide({ summaries }: { summaries: CtaReadinessSummary[] }) {
  return (
    <Card>
      <CardHeader
        accentClass="text-accent-green"
        title="Facebook Hub Tagging — Hướng dẫn gắn tay (Operator)"
        subtitle="Operator tự gắn sản phẩm/native CTA trên Facebook nếu tài khoản/page hỗ trợ."
      />
      <CardBody className="space-y-4">
        <div className="flex items-center gap-2 rounded-xl border border-accent-amber/30 bg-accent-amber/10 px-3.5 py-2 text-[11px] text-accent-amber">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-amber" />
          <span>READ-ONLY · Manual guide · Không gọi Facebook API · Không tự gắn tag</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-neutral-600">ctaMode</p>
            {MODE_NOTES.map(([mode, note]) => (
              <div key={mode} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-neutral-300">{CTA_MODE_LABEL[mode]}</span>
                <span className="text-[10px] text-neutral-600">{note}</span>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-neutral-600">Trạng thái CTA</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge accent={READINESS_META.ready.accent}>{READINESS_META.ready.label}</Badge>
              <Badge accent={READINESS_META.partial.accent}>{READINESS_META.partial.label}</Badge>
              <Badge accent={READINESS_META.blocked.accent}>{READINESS_META.blocked.label}</Badge>
              <Badge accent="blue">CTA: Chưa có plan</Badge>
            </div>
            <p className="text-[10px] text-neutral-600">
              Không ép mọi video 2–3 link — số CTA tùy ctaMode. Facebook Hub là native CTA chính nếu
              có, không thay thế caption/comment/reply.
            </p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[10px] uppercase tracking-wider text-neutral-600">
            Checklist gắn tay thủ công
          </p>
          <ol className="space-y-1.5">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-2.5 text-[11px] text-neutral-400">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-raised text-[9px] font-semibold text-neutral-300">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {summaries.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-wider text-neutral-600">
              CTA theo job đang có lịch
            </p>
            <div className="grid gap-3 lg:grid-cols-2">
              {summaries.map((s) => (
                <div key={s.jobId} className="rounded-xl border border-hairline bg-raised/30 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-neutral-300">{s.jobId}</span>
                    <span className="flex items-center gap-1.5">
                      <Badge accent="violet">{CTA_MODE_LABEL[s.ctaMode]}</Badge>
                      <Badge accent={READINESS_META[s.readiness].accent}>
                        {READINESS_META[s.readiness].label}
                      </Badge>
                    </span>
                  </div>
                  <CtaChecklist summary={s} />
                </div>
              ))}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
