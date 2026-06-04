'use client';

/* =============================================================================
 * VFOS Studio — Manual performance input PREVIEW + LOCAL SAVE (Real Analytics 02A→02B)
 * -----------------------------------------------------------------------------
 * CLIENT component. Operator paste CSV → parse + validate preview (02A) → Save to
 * LOCAL RUNTIME qua POST có guard (02B). KHÔNG gọi Facebook/Shopee API, KHÔNG commit
 * runtime, KHÔNG token/secret. Save chỉ bật khi có ≥1 valid row và 0 invalid row.
 * ========================================================================== */

import { Badge } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import { Button } from '@/components/ui';
import {
  MANUAL_CSV_COLUMNS,
  type ManualCsvParseResult,
  parseManualCsv,
} from '@/lib/growth-data/manual-input';
import type { AccentKey } from '@/lib/nav';
import { useState } from 'react';

const SOURCE_ACCENT: Record<string, AccentKey> = {
  fixture: 'blue',
  manual: 'green',
  manual_import: 'cyan',
  api_future: 'violet',
};

const SAMPLE_CSV = [
  'job_20260530_001,pp_001,2026-06-04T10:00:00Z,12000,320,45,800,20,12,HUB_NATIVE,manual_import',
  'job_20260601_001,pp_002,2026-06-04T10:00:00Z,9500,160,18,240,11,6,,manual',
  'job_99999999_999,,2026-06-04T10:00:00Z,5000,80,3,40,2,1,REPLY_LINK,manual_import',
  'job_20260530_001,pp_001,2026-06-04T10:00:00Z,100,500,2,5,1,3,,manual',
].join('\n');

function formatNumber(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(n);
}

type SaveState = 'idle' | 'saving' | 'done' | 'error';

interface SaveResponse {
  ok: boolean;
  savedCount?: number;
  duplicateIds?: string[];
  invalidRows?: Array<{ index: number; errors: string[] }>;
  runtimePathConfigured?: boolean;
  message?: string;
  code?: string;
  fields?: string[];
}

const SAVE_ENDPOINT = '/api/studio/analytics/manual-performance/save';

export function ManualInputPreview({
  knownJobIds,
  knownPostIds,
}: {
  knownJobIds: string[];
  knownPostIds: string[];
}) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ManualCsvParseResult | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveResp, setSaveResp] = useState<SaveResponse | null>(null);

  const runPreview = () => {
    setResult(parseManualCsv(text, { knownJobIds, knownPostIds }));
    setSaveState('idle');
    setSaveResp(null);
  };
  const clearAll = () => {
    setText('');
    setResult(null);
    setSaveState('idle');
    setSaveResp(null);
  };

  const validRows = result?.rows.filter((r) => r.errors.length === 0) ?? [];
  const invalidRows = result?.rows.filter((r) => r.errors.length > 0) ?? [];
  const warnRows = result?.rows.filter((r) => r.warnings.length > 0) ?? [];

  // Save chỉ bật khi có ≥1 valid row VÀ 0 invalid row (warning vẫn cho lưu).
  const canSave =
    result !== null && result.validCount > 0 && result.invalidCount === 0 && saveState !== 'saving';

  const runSave = async () => {
    if (!result) return;
    const rows = result.rows.filter((r) => r.errors.length === 0).map((r) => r.draft);
    setSaveState('saving');
    setSaveResp(null);
    try {
      const res = await fetch(SAVE_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const data: SaveResponse = await res.json();
      setSaveResp(data);
      setSaveState(data.ok ? 'done' : 'error');
    } catch {
      setSaveResp({ ok: false, message: 'Lỗi mạng khi gọi local save.' });
      setSaveState('error');
    }
  };

  return (
    <Card>
      <CardHeader
        title="Manual Performance Input — Preview & Local Save"
        subtitle="Operator paste CSV → validate → lưu vào local runtime (gitignored). KHÔNG gọi API, KHÔNG commit runtime."
        accentClass="text-accent-violet"
        right={<Badge accent="violet">LOCAL RUNTIME ONLY</Badge>}
      />
      <CardBody className="space-y-4">
        <div className="flex items-center gap-2 rounded-xl border border-accent-amber/30 bg-accent-amber/10 px-3.5 py-2 text-[11px] text-accent-amber">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-amber" />
          <span>
            <strong>
              Local runtime only · Không gọi Facebook/Shopee API · Không commit runtime.
            </strong>{' '}
            Lưu vào file local gitignored, không gửi ra ngoài, không ghi vào fixtures source.
          </span>
        </div>

        <div className="rounded-xl border border-hairline bg-raised/30 px-3.5 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-neutral-600">
            Định dạng CSV (cột)
          </p>
          <p className="mt-1 break-words font-mono text-[10px] text-neutral-400">
            {MANUAL_CSV_COLUMNS.join(',')}
          </p>
          <p className="mt-1 text-[10px] text-neutral-600">
            <code>publishedPostId</code> / <code>ctaRole</code> / <code>source</code> optional ·
            source mặc định <code>manual_import</code> · header tự bỏ qua.
          </p>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          spellCheck={false}
          placeholder="Paste CSV ở đây (mỗi dòng 1 bản ghi)…"
          className="w-full resize-y rounded-xl border border-hairline bg-panel/80 px-3.5 py-2.5 font-mono text-[11px] text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-accent-violet/50"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={runPreview} disabled={text.trim() === ''}>
            Validate Preview
          </Button>
          <Button variant="outline" onClick={() => setText(SAMPLE_CSV)}>
            Dùng ví dụ
          </Button>
          <Button variant="ghost" onClick={clearAll}>
            Xóa
          </Button>
          <Button
            variant="success"
            onClick={runSave}
            disabled={!canSave}
            className="ml-auto"
            title={
              canSave
                ? 'Lưu các dòng hợp lệ vào local runtime (gitignored)'
                : 'Cần ≥1 dòng hợp lệ và 0 dòng lỗi để lưu'
            }
          >
            {saveState === 'saving' ? 'Đang lưu…' : 'Save to Local Runtime'}
          </Button>
        </div>

        {result && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <div className="rounded-xl border border-hairline bg-raised/40 p-3">
                <p className="text-[10px] text-neutral-500">Hợp lệ / Lỗi / Cảnh báo</p>
                <p className="mt-1 text-sm font-semibold">
                  <span className="text-accent-green">{result.validCount}</span>
                  <span className="text-neutral-600"> / </span>
                  <span className="text-accent-rose">{result.invalidCount}</span>
                  <span className="text-neutral-600"> / </span>
                  <span className="text-accent-amber">{result.warningCount}</span>
                </p>
              </div>
              <div className="rounded-xl border border-hairline bg-raised/40 p-3">
                <p className="text-[10px] text-neutral-500">Tổng views / clicks (hợp lệ)</p>
                <p className="mt-1 text-sm font-semibold text-neutral-100">
                  {formatNumber(result.totals.views)} / {formatNumber(result.totals.clicks)}
                </p>
              </div>
              <div className="rounded-xl border border-hairline bg-raised/40 p-3">
                <p className="text-[10px] text-neutral-500">Tổng conversions (hợp lệ)</p>
                <p className="mt-1 text-sm font-semibold text-accent-green">
                  {formatNumber(result.totals.conversions)}
                </p>
              </div>
            </div>

            {result.rows.length === 0 && (
              <p className="py-4 text-center text-xs text-neutral-500">
                Không có dòng dữ liệu nào (chỉ header/blank?).
              </p>
            )}

            {/* Valid preview */}
            {validRows.length > 0 && (
              <div>
                <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-accent-green">
                  Preview hợp lệ ({validRows.length})
                </p>
                <div className="overflow-x-auto rounded-xl border border-hairline">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="text-[10px] uppercase tracking-wider text-neutral-600">
                      <tr className="border-b border-hairline">
                        <th className="px-3 py-2.5 font-medium">#</th>
                        <th className="px-3 py-2.5 font-medium">Job / Post</th>
                        <th className="px-3 py-2.5 font-medium">Đo lúc</th>
                        <th className="px-3 py-2.5 font-medium">Role</th>
                        <th className="px-3 py-2.5 font-medium">Nguồn</th>
                        <th className="px-3 py-2.5 font-medium text-right">Views</th>
                        <th className="px-3 py-2.5 font-medium text-right">Clicks</th>
                        <th className="px-3 py-2.5 font-medium text-right">Conv.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validRows.map((r) => (
                        <tr
                          key={r.line}
                          className="border-b border-hairline/60 last:border-0 hover:bg-raised/30"
                        >
                          <td className="px-3 py-2.5 text-neutral-500">{r.line}</td>
                          <td className="px-3 py-2.5">
                            <div className="font-mono text-[10px] text-neutral-300">
                              {r.draft.jobId}
                              {r.warnings.length > 0 && (
                                <span
                                  className="ml-1.5 text-accent-amber"
                                  title={r.warnings.join('; ')}
                                >
                                  ⚠
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-[10px] text-neutral-600">
                              {r.draft.publishedPostId ?? 'chưa map post'}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[10px] text-neutral-400">
                            {r.draft.measuredAt}
                          </td>
                          <td className="px-3 py-2.5 text-neutral-300">{r.draft.ctaRole ?? '—'}</td>
                          <td className="px-3 py-2.5">
                            <Badge accent={SOURCE_ACCENT[r.draft.source] ?? 'blue'}>
                              {r.draft.source}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-right text-neutral-200">
                            {formatNumber(r.draft.views)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-neutral-200">
                            {formatNumber(r.draft.clicks)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-accent-green">
                            {formatNumber(r.draft.conversions)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Errors */}
            {invalidRows.length > 0 && (
              <div>
                <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-accent-rose">
                  Dòng lỗi ({invalidRows.length}) — không được preview là hợp lệ
                </p>
                <div className="overflow-x-auto rounded-xl border border-accent-rose/30">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead className="text-[10px] uppercase tracking-wider text-neutral-600">
                      <tr className="border-b border-hairline">
                        <th className="px-3 py-2.5 font-medium">#</th>
                        <th className="px-3 py-2.5 font-medium">Nội dung</th>
                        <th className="px-3 py-2.5 font-medium">Lỗi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invalidRows.map((r) => (
                        <tr key={r.line} className="border-b border-hairline/60 last:border-0">
                          <td className="px-3 py-2.5 text-neutral-500">{r.line}</td>
                          <td className="max-w-[260px] truncate px-3 py-2.5 font-mono text-[10px] text-neutral-500">
                            {r.raw}
                          </td>
                          <td className="px-3 py-2.5 text-accent-rose">{r.errors.join(' · ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Warnings (kể cả row hợp lệ) */}
            {warnRows.length > 0 && (
              <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/5 px-3.5 py-2.5">
                <p className="text-[11px] font-semibold text-accent-amber">
                  Cảnh báo ({warnRows.length}) — không chặn, nhưng cần xử lý khi lưu thật
                </p>
                <ul className="mt-1.5 space-y-1">
                  {warnRows.map((r) => (
                    <li key={r.line} className="text-[10px] text-neutral-400">
                      Dòng {r.line}: {r.warnings.join('; ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {saveResp && (
          <div
            className={`rounded-xl border px-4 py-3 ${
              saveResp.ok
                ? 'border-accent-green/30 bg-accent-green/5'
                : 'border-accent-rose/30 bg-accent-rose/5'
            }`}
          >
            <p
              className={`text-[11px] font-semibold ${
                saveResp.ok ? 'text-accent-green' : 'text-accent-rose'
              }`}
            >
              {saveResp.ok ? '✓ Đã lưu vào local runtime' : '✕ Lưu thất bại'}
            </p>
            {saveResp.message && (
              <p className="mt-1 text-[11px] text-neutral-300">{saveResp.message}</p>
            )}
            {saveResp.ok && (
              <ul className="mt-1.5 space-y-0.5 text-[10px] text-neutral-500">
                <li>
                  savedCount: <span className="text-neutral-200">{saveResp.savedCount ?? 0}</span>
                </li>
                <li>
                  Runtime target:{' '}
                  {saveResp.runtimePathConfigured ? 'local runtime configured' : 'chưa cấu hình'}
                </li>
                {saveResp.duplicateIds && saveResp.duplicateIds.length > 0 && (
                  <li className="text-accent-amber">
                    Trùng (bỏ qua): {saveResp.duplicateIds.length} dòng
                  </li>
                )}
              </ul>
            )}
            {!saveResp.ok && saveResp.invalidRows && saveResp.invalidRows.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-[10px] text-accent-rose">
                {saveResp.invalidRows.map((r) => (
                  <li key={r.index}>
                    Dòng {r.index + 1}: {r.errors.join(' · ')}
                  </li>
                ))}
              </ul>
            )}
            {!saveResp.ok && saveResp.fields && saveResp.fields.length > 0 && (
              <p className="mt-1.5 text-[10px] text-accent-rose">
                Trường nhạy cảm bị từ chối: {saveResp.fields.join(', ')}
              </p>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
