/* =============================================================================
 * VFOS Studio — Empty-state "Chưa có số liệu thật" (G2 gate — Revenue Attribution §3 A.1)
 * -----------------------------------------------------------------------------
 * Server-safe presentational, KHÔNG state/effect. Thay chỗ mọi section analytics
 * khi source !== 'real' và dev-fixture flag OFF. Không số, không chart, không 0 giả.
 * kind='money': câu cứng No-Go #6 — KHÔNG BAO GIỜ render fixture cho tiền,
 * độc lập flag (lằn ranh cứng, xem §A.4 spec).
 * ========================================================================== */

import { Card, CardBody, CardHeader } from '@/components/card';

export type NoRealDataProps = {
  /** Tên metric/section (vd "Lượt xem theo ngách", "Doanh thu affiliate"). */
  metric: string;
  /** Vì sao chưa có (vd "chưa có job PUBLISHED"). Optional. */
  reason?: string;
  /** 'money' = nói rõ chưa vẽ chart tiền tới khi có số thật (No-Go #6). */
  kind?: 'metric' | 'money';
};

export function NoRealData({ metric, reason, kind = 'metric' }: NoRealDataProps) {
  return (
    <Card>
      <CardHeader
        title={metric}
        subtitle={kind === 'money' ? 'Doanh thu / lợi nhuận' : 'Chờ dữ liệu thật'}
        accentClass="text-neutral-400"
      />
      <CardBody>
        <div className="flex flex-col items-center gap-1.5 py-8 text-center">
          <p className="text-xs font-semibold text-neutral-300">Chưa có số liệu thật</p>
          <p className="max-w-md text-[11px] leading-relaxed text-neutral-500">
            {kind === 'money'
              ? 'Chưa vẽ biểu đồ doanh thu/lợi nhuận cho tới khi có số liệu thật (No-Go #6).'
              : 'Section này chỉ hiển thị số khi có dữ liệu nguồn thật — không dùng số fixture/mock thay thế.'}
          </p>
          {reason ? <p className="text-[10px] text-neutral-600">{reason}</p> : null}
        </div>
      </CardBody>
    </Card>
  );
}
