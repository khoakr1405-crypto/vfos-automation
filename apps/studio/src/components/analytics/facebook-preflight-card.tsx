'use client';

/* =============================================================================
 * VFOS Studio — Facebook API Preflight Card Component (Real API 02A)
 * -----------------------------------------------------------------------------
 * Client Component hiển thị chẩn đoán kết nối và quyền của Facebook Graph API.
 * An toàn: Không hiển thị token nhạy cảm, chỉ hiển thị trạng thái đã cấu hình.
 * ========================================================================== */

import { Badge } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import { Button } from '@/components/ui';
import { useCallback, useEffect, useState } from 'react';

interface PreflightStatus {
  pageIdConfigured: boolean;
  pageAccessConfigured: boolean;
  metaMode: 'mock' | 'live';
  pageConnectionStatus: 'not_run' | 'pass' | 'blocked' | 'failed';
  insightsCapabilityStatus: 'not_run' | 'pass' | 'partial' | 'blocked' | 'failed';
  blockedReasons: string[];
  checkedAt: string;
}

export function FacebookPreflightCard() {
  const [status, setStatus] = useState<PreflightStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPreflight = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/studio/analytics/facebook-preflight');
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Yêu cầu bị từ chối: Chỉ được phép preflight từ local dev.');
        }
        throw new Error(`HTTP Error ${res.status}`);
      }
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg || 'Lỗi không xác định khi kết nối API preflight.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreflight();
  }, [fetchPreflight]);

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'pass':
        return <Badge accent="green">THÀNH CÔNG</Badge>;
      case 'partial':
        return <Badge accent="amber">MỘT PHẦN</Badge>;
      case 'blocked':
        return <Badge accent="rose">BỊ CHẶN</Badge>;
      case 'failed':
        return <Badge accent="rose">THẤT BẠI</Badge>;
      default:
        return <Badge accent="cyan">CHƯA CHẠY</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader
        title="Facebook API Preflight — Read-only"
        subtitle="Read-only · Không publish · Không reply · Không upload"
        accentClass="text-accent-blue"
        right={
          <Button
            variant="outline"
            className="!py-1 !px-2.5 text-[10px]"
            onClick={fetchPreflight}
            disabled={loading}
          >
            {loading ? 'Đang chạy...' : 'Chạy Chẩn Đoán'}
          </Button>
        }
      />
      <CardBody className="space-y-4 text-xs">
        {error && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-rose-400">
            {error}
          </div>
        )}

        {status ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2.5">
              <p className="font-semibold uppercase tracking-wider text-neutral-500 text-[10px]">
                CẤU HÌNH MÔI TRƯỜNG
              </p>

              <div className="flex items-center justify-between border-b border-hairline/60 pb-1.5">
                <span className="text-neutral-400">Chế độ vận hành (Mode)</span>
                <span className="font-mono font-semibold text-neutral-200">
                  {status.metaMode.toUpperCase()}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-hairline/60 pb-1.5">
                <span className="text-neutral-400">ID Trang (Page ID)</span>
                {status.pageIdConfigured ? (
                  <Badge accent="green">ĐÃ CẤU HÌNH</Badge>
                ) : (
                  <Badge accent="rose">CHƯA CẤU HÌNH</Badge>
                )}
              </div>

              <div className="flex items-center justify-between border-b border-hairline/60 pb-1.5">
                <span className="text-neutral-400">Giá trị xác thực Page</span>
                {status.pageAccessConfigured ? (
                  <Badge accent="green">ĐÃ CẤU HÌNH</Badge>
                ) : (
                  <Badge accent="rose">CHƯA CẤU HÌNH</Badge>
                )}
              </div>
            </div>

            <div className="space-y-2.5">
              <p className="font-semibold uppercase tracking-wider text-neutral-500 text-[10px]">
                KẾT QUẢ KIỂM TRA QUYỀN
              </p>

              <div className="flex items-center justify-between border-b border-hairline/60 pb-1.5">
                <span className="text-neutral-400">Kết nối tới Trang</span>
                {getStatusBadge(status.pageConnectionStatus)}
              </div>

              <div className="flex items-center justify-between border-b border-hairline/60 pb-1.5">
                <span className="text-neutral-400">Khả năng đọc Insights</span>
                {getStatusBadge(status.insightsCapabilityStatus)}
              </div>

              <div className="text-[10px] text-neutral-500 text-right">
                Kiểm tra lúc:{' '}
                {status.checkedAt ? new Date(status.checkedAt).toLocaleTimeString('vi-VN') : '—'}
              </div>
            </div>

            {status.blockedReasons.length > 0 && (
              <div className="md:col-span-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 space-y-1">
                <p className="font-semibold text-amber-400">Chi tiết trạng thái / Lý do chặn:</p>
                <ul className="list-disc pl-4 text-neutral-300 space-y-1">
                  {status.blockedReasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="md:col-span-2 rounded-lg border border-hairline bg-raised/30 p-3">
              <p className="font-semibold text-neutral-200">Bước tiếp theo đề xuất:</p>
              <ul className="list-disc pl-4 mt-1 text-neutral-400 space-y-1">
                {status.pageConnectionStatus === 'pass' &&
                status.insightsCapabilityStatus === 'pass' ? (
                  <li className="text-accent-green">
                    Tất cả kiểm tra đều PASS. Hệ thống sẵn sàng cho Real API 02B Facebook Insights
                    Connector.
                  </li>
                ) : status.pageConnectionStatus === 'pass' &&
                  status.insightsCapabilityStatus === 'partial' ? (
                  <li className="text-accent-cyan">
                    Kết nối Page thành công nhưng chưa tìm thấy bài viết thật. Có thể tiến hành chạy
                    Real API 02B.
                  </li>
                ) : (
                  <li>
                    Nếu bị chặn: Vui lòng bổ sung đầy đủ giá trị xác thực và quyền{' '}
                    <code>pages_read_engagement</code>, <code>read_insights</code> trong file{' '}
                    <code>.env</code>.
                  </li>
                )}
              </ul>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-neutral-500">
            {loading ? 'Đang chạy chẩn đoán preflight...' : 'Vui lòng nhấn nút Chạy Chẩn Đoán.'}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
