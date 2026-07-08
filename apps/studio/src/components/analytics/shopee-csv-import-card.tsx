'use client';

/* =============================================================================
 * VFOS Studio — Shopee Revenue CSV Import Card (G1 — UI Ingestion)
 * -----------------------------------------------------------------------------
 * Client Component: Operator paste CSV export Shopee Affiliate → POST
 * /api/studio/analytics/shopee-revenue/import (local-only, all-or-nothing).
 * CHỈ nạp số THẬT vào runtime store gitignored — component không sinh/tiêm
 * bất kỳ số liệu mock nào (No-Go #6). Validate thật ở server (connector);
 * client chỉ đếm dòng data để Operator đối chiếu trước khi gửi.
 * Sau import thành công → router.refresh() để bảng Evidence M3–M6 (server
 * component) đọc lại store và hiện tiền mới.
 * ========================================================================== */

import { Badge } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import { Button } from '@/components/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const CSV_COLUMNS =
  'affiliateShortLink,itemId,shopId,periodStart,periodEnd,orderCount,conversions,gmv,commission,orderRef';

interface ImportResponse {
  ok: boolean;
  code?: string;
  message?: string;
  savedCount?: number;
  duplicateIds?: string[];
  totalAfter?: number;
  attribution?: { success: number; partial: number; unattributed: number };
  overlapWarnings?: string[];
  contentDuplicates?: string[];
  rejected?: Array<{ reason: string }>;
  fields?: string[];
}

/** Đếm dòng DATA sẽ gửi (bỏ dòng trống, comment '#', header ở dòng đầu) —
 * cùng quy ước với ManualCsvShopeeConnector, chỉ để Operator đối chiếu. */
function countDataLines(csv: string): number {
  let count = 0;
  let headerCandidate = true;
  for (const rawLine of csv.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    if (
      headerCandidate &&
      (trimmed.split(',')[0] ?? '').trim().toLowerCase() === 'affiliateshortlink'
    ) {
      headerCandidate = false;
      continue;
    }
    headerCandidate = false;
    count += 1;
  }
  return count;
}

export function ShopeeCsvImportCard() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);

  const dataLineCount = countDataLines(text);

  const handleImport = async () => {
    setImporting(true);
    setResult(null);
    setNetworkError(null);
    try {
      const res = await fetch('/api/studio/analytics/shopee-revenue/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: text }),
      });
      // Route trả JSON cả khi lỗi (400/403/500) — đọc body để hiện lý do thật.
      const data: ImportResponse = await res.json();
      setResult(data);
      if (data.ok && (data.savedCount ?? 0) > 0) {
        // Clear payload sau khi GHI THẬT — chặn re-import vô ý bằng 1 click
        // (dedupe id/content ở server là lưới thứ hai). Fail thì GIỮ để sửa.
        setText('');
        // Server components (Evidence M3–M6, money card) đọc lại runtime store.
        router.refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setNetworkError(`Không gọi được API import: ${msg}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Nạp doanh thu Shopee — CSV"
        subtitle="Paste export từ Shopee Affiliate dashboard · ghi local runtime (gitignored) · all-or-nothing"
        accentClass="text-accent-green"
        right={<Badge accent="green">SỐ THẬT / LOCAL-ONLY</Badge>}
      />
      <CardBody className="space-y-3 text-xs">
        <div className="rounded-xl border border-hairline bg-raised/30 px-3.5 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-neutral-600">
            Định dạng CSV (đúng thứ tự cột)
          </p>
          <p className="mt-1 break-words font-mono text-[10px] text-neutral-400">{CSV_COLUMNS}</p>
          <p className="mt-1 text-[10px] leading-relaxed text-neutral-600">
            Ngày dạng <code>YYYY-MM-DD</code> · tiền VND <strong>số nguyên chỉ digit</strong> (bỏ
            dấu chấm/phẩy ngăn nghìn — <code>500000</code>, không phải <code>500.000</code>) ·{' '}
            <code>orderRef</code> optional · dòng <code>#</code> và header tự bỏ qua · 1 dòng lỗi →
            KHÔNG import gì cả.
          </p>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          spellCheck={false}
          placeholder={`Paste CSV ở đây (mỗi dòng 1 kỳ đối soát)…\nvd: https://s.shopee.vn/xxxx,10023,501,2026-07-01,2026-07-07,5,3,500000,45000,batch_t27`}
          className="w-full resize-y rounded-xl border border-hairline bg-panel/80 px-3.5 py-2.5 font-mono text-[11px] text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-accent-green/50"
        />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-neutral-500">
            {dataLineCount > 0 ? (
              <>
                Sẽ gửi <span className="font-semibold text-neutral-200">{dataLineCount}</span> dòng
                dữ liệu (server validate lại toàn bộ)
              </>
            ) : (
              'Chưa có dòng dữ liệu nào'
            )}
          </span>
          <Button variant="ghost" onClick={() => setText('')} disabled={text === ''}>
            Xóa
          </Button>
          <Button
            variant="success"
            onClick={handleImport}
            disabled={importing || dataLineCount === 0}
            className="ml-auto"
            title="Server validate all-or-nothing rồi ghi data/growth/runtime (gitignored); trùng snapshotId tự bỏ qua (idempotent)"
          >
            {importing ? 'Đang nạp…' : 'Nạp dữ liệu'}
          </Button>
        </div>

        {networkError && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-rose-400">
            {networkError}
          </div>
        )}

        {result && !result.ok && (
          <div className="space-y-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3">
            <p className="font-semibold text-rose-400">
              IMPORT THẤT BẠI{result.code ? ` — ${result.code}` : ''} · không có dòng nào được ghi
            </p>
            {result.message && <p className="text-neutral-300">{result.message}</p>}
            {result.fields && result.fields.length > 0 && (
              <p className="text-neutral-300">
                Trường nhạy cảm bị chặn: <code>{result.fields.join(', ')}</code>
              </p>
            )}
            {result.rejected && result.rejected.length > 0 && (
              <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-4 text-[11px] leading-relaxed text-neutral-300">
                {result.rejected.map((r) => (
                  <li key={r.reason}>{r.reason}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {result?.ok && (
          <div className="space-y-3">
            {(result.savedCount ?? 0) === 0 && (
              <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-amber">
                Không có dòng nào được ghi mới — số dưới đây là của dòng ĐÃ GỬI (trùng/bỏ qua),
                không phải tiền mới vào store
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-xl border border-hairline bg-raised/40 p-3">
                <p className="text-[10px] text-neutral-500">Dòng ghi mới / Trùng (bỏ qua)</p>
                <p className="mt-1 text-sm font-semibold">
                  <span className="text-accent-green">{result.savedCount ?? 0}</span>
                  <span className="text-neutral-600"> / </span>
                  <span className="text-neutral-400">{result.duplicateIds?.length ?? 0}</span>
                </p>
              </div>
              <div className="rounded-xl border border-hairline bg-raised/40 p-3">
                <p className="text-[10px] text-neutral-500">Attribute được job</p>
                <p className="mt-1 text-sm font-semibold text-accent-green">
                  {result.attribution?.success ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-hairline bg-raised/40 p-3">
                <p className="text-[10px] text-neutral-500">Khớp nhiều job (chờ phân bổ tay)</p>
                <p className="mt-1 text-sm font-semibold text-accent-amber">
                  {result.attribution?.partial ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-hairline bg-raised/40 p-3">
                <p className="text-[10px] text-neutral-500">Không khớp bài đăng nào</p>
                <p className="mt-1 text-sm font-semibold text-neutral-300">
                  {result.attribution?.unattributed ?? 0}
                </p>
              </div>
            </div>

            <div
              className={
                (result.savedCount ?? 0) > 0
                  ? 'rounded-lg border border-accent-green/20 bg-accent-green/5 p-3 text-neutral-300'
                  : 'rounded-lg border border-hairline bg-raised/40 p-3 text-neutral-300'
              }
            >
              {result.message}
              {typeof result.totalAfter === 'number' && (
                <span className="text-neutral-500">
                  {' '}
                  · store hiện có {result.totalAfter} dòng doanh thu.
                </span>
              )}
            </div>

            {result.contentDuplicates && result.contentDuplicates.length > 0 && (
              <div className="space-y-1 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                <p className="font-semibold text-amber-400 text-[10px] uppercase tracking-wider">
                  Dòng bỏ qua vì trùng nội dung store (chống đếm trùng tiền)
                </p>
                <ul className="max-h-32 list-disc space-y-1 overflow-y-auto pl-4 text-[11px] leading-relaxed text-neutral-300">
                  {[...new Set(result.contentDuplicates)].map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.overlapWarnings && result.overlapWarnings.length > 0 && (
              <div className="space-y-1 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                <p className="font-semibold text-amber-400 text-[10px] uppercase tracking-wider">
                  Cảnh báo kỳ chồng lấn — nguy cơ đếm trùng tiền
                </p>
                <ul className="max-h-32 list-disc space-y-1 overflow-y-auto pl-4 text-[11px] leading-relaxed text-neutral-300">
                  {/* Set: 2 cặp kỳ khác nhau có thể sinh chuỗi warning giống hệt
                      (route không nội suy id snapshot đối chiếu) → dedupe hiển thị,
                      key ổn định. */}
                  {[...new Set(result.overlapWarnings)].map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
