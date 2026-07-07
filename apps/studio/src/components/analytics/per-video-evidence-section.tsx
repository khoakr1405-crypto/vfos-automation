'use client';

/* =============================================================================
 * VFOS Studio — Bảng số liệu theo TỪNG VIDEO đã đăng (Real Analytics — per-video)
 * -----------------------------------------------------------------------------
 * CLIENT. Mỗi video đã đăng = 1 dòng: thumbnail (frame nguồn) + tiêu đề + link bài
 * + link affiliate + số M3–M6 đã đo. Bấm "Nhập số cho video này" → gợi ý dòng CSV
 * xuống ô nhập bên dưới (ManualInputPreview) cho ĐÚNG video đó. Số chưa đo = "—"
 * (KHÔNG bịa 0). Read-only ngoài phần gợi ý nhập; save vẫn qua route local-only.
 * ========================================================================== */

import { Badge } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import { Button } from '@/components/ui';
import type { JobEvidenceSummary } from '@/lib/studio-data/types';
import { useState } from 'react';
import { ManualInputPreview } from './manual-input-preview';

export interface PerVideoRow {
  jobId: string;
  publishedPostId: string;
  title: string;
  channelName: string;
  permalinkUrl: string | null;
  affiliateShortLink: string | null;
  thumbUrl: string;
  evidence: JobEvidenceSummary | null;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(n);
}

const METRIC_COLS: { key: 'views' | 'clicks' | 'conversions' | 'revenue'; label: string }[] = [
  { key: 'views', label: 'Views' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'conversions', label: 'Đơn' },
  { key: 'revenue', label: 'D.thu' },
];

export function PerVideoEvidenceSection({
  rows,
  source,
  knownJobIds,
  knownPostIds,
}: {
  rows: PerVideoRow[];
  source: 'real' | 'fixture';
  knownJobIds: string[];
  knownPostIds: string[];
}) {
  const [prefill, setPrefill] = useState<{ jobId: string; postId: string | null } | null>(null);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Số liệu theo từng video đã đăng"
          subtitle="Mỗi video 1 dòng — bấm “Nhập số cho video này” để ghi view/click/đơn/doanh thu (M3–M6) cho đúng video đó."
          accentClass="text-accent-green"
          right={
            <Badge accent={source === 'real' ? 'green' : 'blue'}>
              {source === 'real' ? 'VIDEO ĐÃ ĐĂNG THẬT' : 'FIXTURE DEMO'}
            </Badge>
          }
        />
        <CardBody className="!p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-center text-xs text-neutral-500">
              Chưa có video nào đã đăng để đo.
            </p>
          ) : (
            <div className="divide-y divide-hairline/50">
              {rows.map((r) => {
                const active = prefill?.jobId === r.jobId;
                return (
                  <div
                    key={r.publishedPostId}
                    className="flex flex-wrap items-center gap-3 p-4 hover:bg-raised/30"
                  >
                    {/* Thumbnail = FRAME NGUỒN (không phải cover Facebook thật) — nhãn rõ bên dưới */}
                    <div className="flex shrink-0 flex-col items-center gap-0.5">
                      <div className="relative h-24 w-[72px] overflow-hidden rounded-md border border-hairline bg-raised">
                        <span className="absolute inset-0 flex items-center justify-center text-[9px] text-neutral-600">
                          frame
                        </span>
                        {/* biome-ignore lint/performance/noImgElement: stream nội bộ, không cần next/image */}
                        <img
                          src={r.thumbUrl}
                          alt=""
                          loading="lazy"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                          className="relative h-full w-full object-cover"
                        />
                      </div>
                      <span className="text-[8px] uppercase tracking-wider text-neutral-600">
                        frame nguồn
                      </span>
                    </div>

                    {/* Tiêu đề + link */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-neutral-100">{r.title}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-neutral-500">{r.jobId}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
                        {r.permalinkUrl && (
                          <a
                            href={r.permalinkUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent-cyan underline hover:text-accent-cyan/80"
                          >
                            Xem bài ↗
                          </a>
                        )}
                        {r.affiliateShortLink && (
                          <a
                            href={r.affiliateShortLink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent-green underline hover:text-accent-green/80"
                          >
                            Link affiliate ↗
                          </a>
                        )}
                        <span className="text-neutral-500">Kênh: {r.channelName}</span>
                      </div>
                    </div>

                    {/* Số M3–M6 — per-metric "—" khi chưa đo (G1 Slice 5): job chỉ có
                        số Shopee (snapshotCount 0) không hiện 0 giả cho engagement;
                        revenue chỉ hiện khi có nguồn tiền thật (revenueSource). */}
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {METRIC_COLS.map((c) => {
                        const measured = r.evidence
                          ? c.key === 'revenue'
                            ? r.evidence.revenueSource !== null
                            : r.evidence.snapshotCount > 0
                          : false;
                        return (
                          <div key={c.key} className="min-w-[52px]">
                            <p className="text-[9px] uppercase tracking-wider text-neutral-600">
                              {c.label}
                            </p>
                            <p
                              className={`text-[11px] font-semibold ${
                                measured
                                  ? c.key === 'revenue'
                                    ? 'text-accent-green'
                                    : 'text-neutral-100'
                                  : 'text-neutral-600'
                              }`}
                            >
                              {measured && r.evidence ? fmt(r.evidence[c.key]) : '—'}
                            </p>
                            {c.key === 'revenue' &&
                              r.evidence &&
                              (r.evidence.revenueSource === 'manual_csv' ||
                                r.evidence.revenueSource === 'shopee_affiliate_api') && (
                                <p className="text-[8px] uppercase tracking-wider text-accent-green/70">
                                  {r.evidence.revenueSource === 'manual_csv'
                                    ? 'Shopee CSV'
                                    : 'Shopee API'}
                                </p>
                              )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Action → gợi ý nhập cho video này */}
                    <Button
                      variant={active ? 'primary' : 'outline'}
                      onClick={() => setPrefill({ jobId: r.jobId, postId: r.publishedPostId })}
                      className="!py-1.5 !px-2.5 text-[11px]"
                    >
                      {active ? 'Đang nhập ▾' : 'Nhập số cho video này'}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Ô nhập M3–M6 — nhận prefill theo video đang chọn, save vẫn qua route local-only */}
      <ManualInputPreview
        knownJobIds={knownJobIds}
        knownPostIds={knownPostIds}
        prefillJobId={prefill?.jobId ?? null}
        prefillPostId={prefill?.postId ?? null}
      />
    </div>
  );
}
