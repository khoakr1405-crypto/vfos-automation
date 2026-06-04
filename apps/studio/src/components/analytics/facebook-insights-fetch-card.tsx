'use client';

/* =============================================================================
 * VFOS Studio — Facebook Insights Fetch Card Component (Real API 02B)
 * -----------------------------------------------------------------------------
 * Client Component thực hiện fetch số liệu Facebook Graph API an toàn.
 * Hiển thị số bài đăng khả dụng, trạng thái mock/live và kết quả lưu trữ runtime.
 * Không in token lên màn hình, không log token.
 * ========================================================================== */

import { Badge } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import { Button } from '@/components/ui';
import { useCallback, useEffect, useState } from 'react';

interface FetchResult {
  ok: boolean;
  mode?: 'mock' | 'live';
  metaMode: 'mock' | 'live';
  attemptedCount: number;
  savedCount: number;
  successCount: number;
  partialCount: number;
  blockedCount: number;
  failedCount: number;
  blockedReasons: string[];
  runtimeTargetConfigured: boolean;
  message?: string;
}

export function FacebookInsightsFetchCard() {
  const [mode, setMode] = useState<'mock' | 'live'>('mock');
  const [validPostsCount, setValidPostsCount] = useState<number | null>(null);
  const [fetching, setFetching] = useState(false);
  const [result, setResult] = useState<FetchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  // Load basic configurations from preflight endpoint on mount
  const loadMetadata = useCallback(async () => {
    try {
      const res = await fetch('/api/studio/analytics/facebook-preflight');
      if (res.ok) {
        const data = await res.json();
        setMode(data.metaMode);
        setValidPostsCount(data.validPostsCount ?? 0);
      }
    } catch {
      // Gracefully swallow config fetch error
    }
  }, []);

  useEffect(() => {
    loadMetadata();
  }, [loadMetadata]);

  const handleFetch = async () => {
    setFetching(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/studio/analytics/facebook-insights/fetch', {
        method: 'POST',
      });
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Yêu cầu bị từ chối: Chỉ được phép fetch từ local dev.');
        }
        throw new Error(`HTTP Error ${res.status}`);
      }
      const data: FetchResult = await res.json();
      setResult(data);
      setFetchedAt(new Date().toISOString());

      // Refresh metadata post count
      if (data.attemptedCount !== undefined) {
        setValidPostsCount(data.attemptedCount);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg || 'Lỗi không xác định khi fetch metrics.');
    } finally {
      setFetching(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Facebook Insights Fetch — Read-only"
        subtitle="Read-only · Không publish · Không reply · Không upload"
        accentClass="text-accent-blue"
        right={
          <Button
            variant="outline"
            className="!py-1 !px-2.5 text-[10px]"
            onClick={handleFetch}
            disabled={fetching}
          >
            {fetching ? 'Đang fetch...' : 'Fetch Facebook Metrics'}
          </Button>
        }
      />
      <CardBody className="space-y-4 text-xs">
        {error && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-rose-400">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2.5">
            <p className="font-semibold uppercase tracking-wider text-neutral-500 text-[10px]">
              THÔNG TIN RUNTIME
            </p>

            <div className="flex items-center justify-between border-b border-hairline/60 pb-1.5">
              <span className="text-neutral-400">Chế độ vận hành (Mode)</span>
              <span className="font-mono font-semibold text-neutral-200">{mode.toUpperCase()}</span>
            </div>

            <div className="flex items-center justify-between border-b border-hairline/60 pb-1.5">
              <span className="text-neutral-400">Số bài đăng khả dụng</span>
              <span className="font-mono font-semibold text-neutral-200">
                {validPostsCount !== null ? validPostsCount : 'Đang tải...'}
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-hairline/60 pb-1.5">
              <span className="text-neutral-400">Tệp lưu trữ cục bộ</span>
              <span className="font-mono text-neutral-400 text-[10px]">
                api-performance-snapshots.json
              </span>
            </div>
          </div>

          <div className="space-y-2.5">
            <p className="font-semibold uppercase tracking-wider text-neutral-500 text-[10px]">
              KẾT QUẢ FETCH CUỐI CÙNG
            </p>

            {result ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Số bài đăng đã kiểm tra:</span>
                  <span className="font-mono font-semibold text-neutral-200">
                    {result.attemptedCount}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Số snapshot đã lưu mới:</span>
                  <Badge accent="green">{result.savedCount} snapshots</Badge>
                </div>
                <div className="flex items-center justify-between text-[10px] text-neutral-500 pt-1">
                  <span>Thành công: {result.successCount}</span>
                  <span>Một phần: {result.partialCount}</span>
                  <span>Bị chặn: {result.blockedCount}</span>
                  <span>Lỗi: {result.failedCount}</span>
                </div>
              </div>
            ) : (
              <div className="text-neutral-500 italic py-2">
                Chưa thực hiện fetch trong phiên làm việc này.
              </div>
            )}

            {fetchedAt && (
              <div className="text-[10px] text-neutral-500 text-right">
                Fetch lúc: {new Date(fetchedAt).toLocaleTimeString('vi-VN')}
              </div>
            )}
          </div>

          {result && result.blockedReasons.length > 0 && (
            <div className="md:col-span-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 space-y-1">
              <p className="font-semibold text-amber-400 text-[10px]">
                THÔNG BÁO CHI TIẾT / CẢNH BÁO:
              </p>
              <ul className="list-disc pl-4 text-neutral-300 space-y-1 max-h-32 overflow-y-auto">
                {result.blockedReasons.map((reason) => (
                  <li key={reason} className="text-[11px] leading-relaxed">
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
