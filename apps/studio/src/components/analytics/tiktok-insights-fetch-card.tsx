'use client';

/* =============================================================================
 * VFOS Studio — TikTok Insights Fetch Card Component (Real API 05C)
 * -----------------------------------------------------------------------------
 * Client Component chạy TikTok Display API read-only fetch (list-only).
 * An toàn: không upload/publish/comment, không hiển thị access value, wording
 * an toàn (không "secret/token"). Clicks/conversions không khả dụng từ TikTok.
 * ========================================================================== */

import { Badge } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import { Button } from '@/components/ui';
import { useCallback, useEffect, useState } from 'react';

interface PreflightStatus {
  mode: 'disabled' | 'mock' | 'display' | 'business';
  clientKeyConfigured: boolean;
  clientSecretConfigured: boolean;
  accessConfigured: boolean;
  openIdConfigured: boolean;
}

interface FetchResult {
  ok: boolean;
  mode: 'disabled' | 'mock' | 'display' | 'business';
  attemptedCount: number;
  savedCount: number;
  successCount: number;
  partialCount: number;
  blockedCount: number;
  failedCount: number;
  unmappedCount: number;
  runtimeTargetConfigured: boolean;
  messages: string[];
  checkedAt: string;
}

const MODE_LABEL: Record<string, string> = {
  disabled: 'Chưa bật (Disabled)',
  mock: 'Giả lập (Mock Mode)',
  display: 'Display API',
  business: 'Business API',
};

export function TikTokInsightsFetchCard() {
  const [pre, setPre] = useState<PreflightStatus | null>(null);
  const [fetching, setFetching] = useState(false);
  const [result, setResult] = useState<FetchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMeta = useCallback(async () => {
    try {
      const res = await fetch('/api/studio/analytics/tiktok-preflight');
      if (res.ok) setPre(await res.json());
    } catch {
      // Bỏ qua lỗi nạp cấu hình nhẹ
    }
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const handleFetch = async () => {
    setFetching(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/studio/analytics/tiktok-insights/fetch', { method: 'POST' });
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Yêu cầu bị từ chối: Chỉ được phép fetch từ local dev.');
        }
        throw new Error(`HTTP Error ${res.status}`);
      }
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định khi fetch metrics.');
    } finally {
      setFetching(false);
    }
  };

  const modeLabel = pre ? (MODE_LABEL[pre.mode] ?? pre.mode) : 'Đang tải...';

  return (
    <Card>
      <CardHeader
        title="TikTok Insights Fetch — Read-only"
        subtitle="Read-only · Không upload · Không publish · Không comment · Không lấy clicks/conversions"
        accentClass="text-accent-cyan"
        right={
          <Button
            variant="outline"
            className="!py-1 !px-2.5 text-[10px]"
            onClick={handleFetch}
            disabled={fetching}
          >
            {fetching ? 'Đang fetch...' : 'Fetch TikTok Metrics'}
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
              THÔNG TIN BỔ SUNG ĐÃ CẤU HÌNH
            </p>

            <div className="flex items-center justify-between border-b border-hairline/60 pb-1.5">
              <span className="text-neutral-400">Chế độ vận hành (Mode)</span>
              <span className="font-mono font-semibold text-neutral-200">{modeLabel}</span>
            </div>

            <div className="flex items-center justify-between border-b border-hairline/60 pb-1.5">
              <span className="text-neutral-400">Giá trị xác thực truy cập</span>
              {pre?.accessConfigured ? (
                <Badge accent="green">ĐÃ THIẾT LẬP</Badge>
              ) : (
                <Badge accent="cyan">CHƯA THIẾT LẬP</Badge>
              )}
            </div>

            <div className="flex items-center justify-between border-b border-hairline/60 pb-1.5">
              <span className="text-neutral-400">Mã người dùng mở (Open ID)</span>
              {pre?.openIdConfigured ? (
                <Badge accent="green">ĐÃ THIẾT LẬP</Badge>
              ) : (
                <Badge accent="cyan">CHƯA THIẾT LẬP</Badge>
              )}
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
                  <span className="text-neutral-400">Số video đã kiểm tra:</span>
                  <span className="font-mono font-semibold text-neutral-200">
                    {result.attemptedCount}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Số snapshot đã lưu mới:</span>
                  <Badge accent="green">{result.savedCount} snapshots</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Chưa map vào job (unmapped):</span>
                  <Badge accent="cyan">{result.unmappedCount}</Badge>
                </div>
                <div className="flex items-center justify-between text-[10px] text-neutral-500 pt-1">
                  <span>Thành công: {result.successCount}</span>
                  <span>Bị chặn: {result.blockedCount}</span>
                  <span>Lỗi: {result.failedCount}</span>
                </div>
              </div>
            ) : (
              <div className="text-neutral-500 italic py-2">
                Chưa thực hiện fetch trong phiên làm việc này.
              </div>
            )}
          </div>

          {result && result.messages.length > 0 && (
            <div className="md:col-span-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 space-y-1">
              <p className="font-semibold text-amber-400 text-[10px]">THÔNG BÁO CHI TIẾT:</p>
              <ul className="list-disc pl-4 text-neutral-300 space-y-1 max-h-32 overflow-y-auto">
                {result.messages.map((m) => (
                  <li key={m} className="text-[11px] leading-relaxed">
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="md:col-span-2 rounded-lg border border-hairline bg-raised/30 p-3 text-[11px] text-neutral-400">
            TikTok Display API chỉ cung cấp{' '}
            <span className="text-neutral-200">views, reactions, comments, shares</span> (organic).{' '}
            <span className="text-neutral-200">Clicks và conversions KHÔNG khả dụng</span> — vẫn cần
            nhập tay / Shopee Affiliate. Read-only: không upload, không publish, không comment.
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
