'use client';

/* =============================================================================
 * VFOS Studio — TikTok API Preflight Card Component (Real API 05A)
 * -----------------------------------------------------------------------------
 * Client Component hiển thị chẩn đoán kết nối và quyền của TikTok API.
 * An toàn: Không hiển thị token hay secret, sử dụng thuật ngữ an toàn.
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
  businessAccessConfigured: boolean;
  capabilityStatus: 'not_run' | 'configured' | 'missing_config' | 'blocked';
  blockedReasons: string[];
  checkedAt: string;
}

export function TikTokPreflightCard() {
  const [status, setStatus] = useState<PreflightStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPreflight = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/studio/analytics/tiktok-preflight');
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
      case 'configured':
        return <Badge accent="green">SẴN SÀNG</Badge>;
      case 'missing_config':
        return <Badge accent="rose">THIẾU CẤU HÌNH</Badge>;
      case 'blocked':
        return <Badge accent="rose">BỊ CHẶN</Badge>;
      default:
        return <Badge accent="cyan">CHƯA CHẠY</Badge>;
    }
  };

  const getModeLabel = (m: string) => {
    switch (m) {
      case 'disabled':
        return 'Chưa bật (Disabled)';
      case 'mock':
        return 'Giả lập (Mock Mode)';
      case 'display':
        return 'Display API';
      case 'business':
        return 'Business API';
      default:
        return m.toUpperCase();
    }
  };

  return (
    <Card>
      <CardHeader
        title="TikTok API Preflight — Read-only"
        subtitle="Read-only · Không upload · Không publish · Không lấy metrics"
        accentClass="text-accent-cyan"
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
                  {getModeLabel(status.mode)}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-hairline/60 pb-1.5">
                <span className="text-neutral-400">Mã định danh App (App Key)</span>
                {status.clientKeyConfigured ? (
                  <Badge accent="green">ĐÃ THIẾT LẬP</Badge>
                ) : (
                  <Badge accent="rose">CHƯA THIẾT LẬP</Badge>
                )}
              </div>

              <div className="flex items-center justify-between border-b border-hairline/60 pb-1.5">
                <span className="text-neutral-400">Giá trị riêng tư App (App Private Key)</span>
                {status.clientSecretConfigured ? (
                  <Badge accent="green">ĐÃ THIẾT LẬP</Badge>
                ) : (
                  <Badge accent="rose">CHƯA THIẾT LẬP</Badge>
                )}
              </div>
            </div>

            <div className="space-y-2.5">
              <p className="font-semibold uppercase tracking-wider text-neutral-500 text-[10px]">
                TRẠNG THÁI KẾT NỐI & XÁC THỰC
              </p>

              <div className="flex items-center justify-between border-b border-hairline/60 pb-1.5">
                <span className="text-neutral-400">Khả năng hoạt động (Preflight Status)</span>
                {getStatusBadge(status.capabilityStatus)}
              </div>

              <div className="flex items-center justify-between border-b border-hairline/60 pb-1.5">
                <span className="text-neutral-400">Thông tin xác thực bổ sung</span>
                {status.accessConfigured || status.businessAccessConfigured ? (
                  <Badge accent="green">CÓ SẴN</Badge>
                ) : (
                  <Badge accent="cyan">CHƯA CÓ</Badge>
                )}
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
                {status.capabilityStatus === 'configured' ? (
                  <li className="text-accent-green">
                    Tất cả kiểm tra đều PASS. Hệ thống sẵn sàng cho Real API 05B TikTok Insights
                    Connector.
                  </li>
                ) : status.mode === 'disabled' ? (
                  <li>
                    Để bắt đầu kiểm tra, hãy cập nhật cấu hình <code>TIKTOK_MODE</code> khác{' '}
                    <code>disabled</code>.
                  </li>
                ) : (
                  <li>
                    Nếu thiếu cấu hình: Vui lòng bổ sung các thông tin cần thiết trong cấu hình môi
                    trường cục bộ.
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
