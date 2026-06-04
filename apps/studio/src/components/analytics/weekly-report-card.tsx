'use client';

/* =============================================================================
 * VFOS Studio — Weekly Growth Review Report Card (Real API 04A)
 * -----------------------------------------------------------------------------
 * Giao diện quản lý, tạo mới và xem lịch sử báo cáo tuần.
 * Ghi trực tiếp xuống runtime gitignored. Không gọi ngoài, hoàn toàn nội bộ.
 * ========================================================================== */

import { Badge } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import { Button } from '@/components/ui';
import { useCallback, useEffect, useState } from 'react';

interface ArchiveItem {
  weekId: string;
  jsonAvailable: boolean;
  markdownAvailable: boolean;
  generatedAt: string | null;
  dataConfidence: 'low' | 'medium' | 'high' | null;
  summary: {
    views: number;
    clicks: number;
    ctr: number;
    conversions: number;
    decisionCount: number;
    actionPlanCount: number;
  } | null;
}

interface GenerateResult {
  ok: boolean;
  reportId: string;
  weekId: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  dataConfidence: 'low' | 'medium' | 'high';
  kpi: {
    views: number;
    clicks: number;
    ctr: number | null;
    conversions: number;
  };
  decisionsCount: number;
  actionPlanCount: number;
  runtimeTargetConfigured: boolean;
  generatedFiles: string[];
}

function getIsoWeekIdHelper(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay();
  const diff = 4 - (day === 0 ? 7 : day);
  d.setUTCDate(d.getUTCDate() + diff);
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${year}-W${String(weekNo).padStart(2, '0')}`;
}

export function WeeklyReportCard() {
  const [weeksList, setWeeksList] = useState<string[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<GenerateResult | null>(null);
  const [archive, setArchive] = useState<ArchiveItem[]>([]);
  const [loadingArchive, setLoadingArchive] = useState(false);
  const [previewWeekId, setPreviewWeekId] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate list of recent 6 weeks for dropdown
  useEffect(() => {
    const list = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      list.push(getIsoWeekIdHelper(d));
    }
    setWeeksList(list);
    setSelectedWeek(list[0]);
  }, []);

  const loadArchive = useCallback(async () => {
    setLoadingArchive(true);
    try {
      const res = await fetch('/api/studio/analytics/weekly-report/archive');
      if (res.ok) {
        const data = await res.json();
        setArchive(data);
      }
    } catch {
      // Swallowed gracefully
    } finally {
      setLoadingArchive(false);
    }
  }, []);

  useEffect(() => {
    loadArchive();
  }, [loadArchive]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setGenResult(null);
    try {
      const res = await fetch('/api/studio/analytics/weekly-report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekId: selectedWeek }),
      });
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Yêu cầu bị chặn: Chỉ chạy cục bộ từ localhost.');
        }
        const data = await res.json();
        throw new Error(data.message || `Lỗi HTTP ${res.status}`);
      }
      const data: GenerateResult = await res.json();
      setGenResult(data);
      loadArchive();

      // Auto-preview generated report
      handleLoadPreview(data.weekId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleLoadPreview = async (weekId: string) => {
    setPreviewWeekId(weekId);
    setLoadingPreview(true);
    setPreviewContent(null);
    try {
      const res = await fetch(`/api/studio/analytics/weekly-report/archive?weekId=${weekId}`);
      if (res.ok) {
        const data = await res.json();
        setPreviewContent(data.content);
      } else {
        setPreviewContent('Không tìm thấy nội dung báo cáo.');
      }
    } catch {
      setPreviewContent('Lỗi tải nội dung báo cáo.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const confidenceColor = (conf: string | null) => {
    if (conf === 'high') return 'green' as const;
    if (conf === 'medium') return 'amber' as const;
    return 'rose' as const;
  };

  return (
    <Card>
      <CardHeader
        title="Weekly Growth Review Report"
        subtitle="Local runtime · Read-only archive · Không gọi API ngoài"
        accentClass="text-accent-cyan"
        right={<Badge accent="cyan">Local Engine</Badge>}
      />
      <CardBody className="space-y-5 text-xs">
        {error && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-rose-400">
            {error}
          </div>
        )}

        {/* Generate Control panel */}
        <div className="flex flex-col gap-4 rounded-xl border border-hairline/60 bg-raised/20 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="font-semibold text-neutral-200">Tạo báo cáo tăng trưởng tuần</p>
            <p className="text-[10px] text-neutral-500">
              Đọc metric runtime và manual snapshots để đánh giá hiệu suất, kiến nghị scale/sửa.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="rounded-lg border border-hairline bg-card px-2.5 py-1.5 font-mono text-xs text-neutral-200 focus:outline-none focus:ring-1 focus:ring-accent-cyan/40"
              disabled={generating}
            >
              {weeksList.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
            <Button
              onClick={handleGenerate}
              disabled={generating || !selectedWeek}
              className="!bg-accent-cyan !text-black font-semibold hover:!bg-accent-cyan/80 transition-colors"
            >
              {generating ? 'Đang tạo...' : 'Generate Weekly Report Now'}
            </Button>
          </div>
        </div>

        {/* Last Generation Result Panel */}
        {genResult && (
          <div className="rounded-xl border border-accent-cyan/20 bg-accent-cyan/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-accent-cyan">
                Báo cáo tuần {genResult.weekId} đã sinh thành công!
              </span>
              <span className="font-mono text-[10px] text-neutral-500">
                ID: {genResult.reportId}
              </span>
            </div>

            <div className="grid gap-2 grid-cols-2 md:grid-cols-4 text-center">
              <div className="bg-raised/40 p-2 rounded-lg">
                <p className="text-[10px] text-neutral-500">Lượt xem</p>
                <p className="text-sm font-semibold text-neutral-200">
                  {genResult.kpi.views.toLocaleString()}
                </p>
              </div>
              <div className="bg-raised/40 p-2 rounded-lg">
                <p className="text-[10px] text-neutral-500">Lượt nhấp</p>
                <p className="text-sm font-semibold text-neutral-200">
                  {genResult.kpi.clicks.toLocaleString()}
                </p>
              </div>
              <div className="bg-raised/40 p-2 rounded-lg">
                <p className="text-[10px] text-neutral-500">CTR</p>
                <p className="text-sm font-semibold text-accent-green">
                  {genResult.kpi.ctr !== null ? `${(genResult.kpi.ctr * 100).toFixed(2)}%` : 'N/A'}
                </p>
              </div>
              <div className="bg-raised/40 p-2 rounded-lg">
                <p className="text-[10px] text-neutral-500">Chuyển đổi</p>
                <p className="text-sm font-semibold text-neutral-200">
                  {genResult.kpi.conversions.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-[10px] text-neutral-400">
              <span>
                Độ tin cậy:{' '}
                <Badge accent={confidenceColor(genResult.dataConfidence)}>
                  {genResult.dataConfidence.toUpperCase()}
                </Badge>
              </span>
              <span>
                Số quyết định: <strong>{genResult.decisionsCount}</strong>
              </span>
              <span>
                Kế hoạch hành động: <strong>{genResult.actionPlanCount}</strong>
              </span>
              <span>
                Đã lưu: <strong>{genResult.generatedFiles.join(', ')}</strong>
              </span>
            </div>
          </div>
        )}

        {/* History / Archives Section */}
        <div className="space-y-2">
          <p className="px-1 font-semibold uppercase tracking-wider text-neutral-500 text-[10px]">
            Lịch sử lưu trữ báo cáo (Archives)
          </p>

          <div className="overflow-x-auto rounded-xl border border-hairline">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-neutral-600">
                <tr className="border-b border-hairline bg-raised/20">
                  <th className="px-4 py-2 font-medium">Mã tuần</th>
                  <th className="px-4 py-2 font-medium">Ngày tạo</th>
                  <th className="px-4 py-2 font-medium">Độ tin cậy</th>
                  <th className="px-4 py-2 font-medium text-right">Lượt xem</th>
                  <th className="px-4 py-2 font-medium text-right">Click (CTR)</th>
                  <th className="px-4 py-2 font-medium text-right">Mua hàng</th>
                  <th className="px-4 py-2 font-medium text-center">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {archive.map((item) => (
                  <tr
                    key={item.weekId}
                    className={`border-b border-hairline/60 last:border-0 hover:bg-raised/30 transition-colors ${
                      previewWeekId === item.weekId ? 'bg-accent-cyan/5' : ''
                    }`}
                  >
                    <td className="px-4 py-2.5 font-mono font-semibold text-neutral-200">
                      {item.weekId}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-400">
                      {item.generatedAt ? new Date(item.generatedAt).toLocaleString('vi-VN') : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge accent={confidenceColor(item.dataConfidence)}>
                        {(item.dataConfidence || 'low').toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-neutral-300">
                      {item.summary ? item.summary.views.toLocaleString() : '0'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {item.summary ? (
                        <span className="text-neutral-300">
                          {item.summary.clicks.toLocaleString()}{' '}
                          <span className="text-[10px] text-accent-green font-semibold">
                            ({(item.summary.ctr * 100).toFixed(2)}%)
                          </span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-neutral-200">
                      {item.summary ? item.summary.conversions.toLocaleString() : '0'}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <Button
                        variant="ghost"
                        className="!py-1 !px-2.5 text-[10px] text-accent-cyan hover:underline"
                        onClick={() => handleLoadPreview(item.weekId)}
                      >
                        {previewWeekId === item.weekId && loadingPreview
                          ? 'Đang mở...'
                          : 'Open Markdown'}
                      </Button>
                    </td>
                  </tr>
                ))}
                {archive.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-neutral-500 italic">
                      {loadingArchive
                        ? 'Đang tải danh sách báo cáo...'
                        : 'Chưa có báo cáo nào được sinh.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Markdown report previewer */}
        {previewWeekId && (
          <div className="rounded-xl border border-hairline bg-raised/10 p-4 space-y-2">
            <div className="flex items-center justify-between border-b border-hairline/60 pb-2">
              <span className="font-semibold text-neutral-200">
                Xem Báo cáo: <span className="font-mono text-accent-cyan">{previewWeekId}</span>
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="!py-1 !px-2 text-[10px]"
                  onClick={() => {
                    if (previewContent) {
                      navigator.clipboard.writeText(previewContent);
                      alert('Đã copy nội dung Markdown vào clipboard.');
                    }
                  }}
                  disabled={!previewContent}
                >
                  Sao chép MD
                </Button>
                <Button
                  variant="ghost"
                  className="!py-1 !px-2 text-[10px] text-neutral-400 hover:text-neutral-200"
                  onClick={() => {
                    setPreviewWeekId(null);
                    setPreviewContent(null);
                  }}
                >
                  Đóng
                </Button>
              </div>
            </div>

            {loadingPreview ? (
              <div className="py-12 text-center text-neutral-500 italic">Đang tải báo cáo...</div>
            ) : previewContent ? (
              <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border border-hairline bg-neutral-900/80 p-3.5 font-mono text-[10.5px] leading-relaxed text-neutral-300">
                {previewContent}
              </pre>
            ) : (
              <div className="py-6 text-center text-neutral-500 italic">
                Không thể tải nội dung báo cáo.
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
