'use client';

import { PLATFORMS, type PublishContent, type PlatformPublishState, type PublishPlatformStatus, SHOPEE_OWNER } from '@/lib/mock-data';
import { useState, useEffect } from 'react';
import { PlatformPublishCard } from './platform-publish-card';
import { PublishGateChecklist } from './publish-gate-checklist';
import { PublishQueueTable } from './publish-queue-table';
import { SelectedPublishContent } from './selected-publish-content';
import { UtilIcon } from '../icons';

function mapDtoToPublishContent(dto: any): PublishContent {
  const isApproved = dto.status === 'APPROVED' || dto.status === 'PACKAGED';
  const isPackaged = dto.status === 'PACKAGED';

  // Find QA status
  const qaGate = dto.gateChecks?.find((g: any) => g.label === 'Final QA PASS');
  const qaPassed = qaGate ? qaGate.status === 'pass' : false;

  // Find preview status
  const previewGate = dto.gateChecks?.find((g: any) => g.label === 'Captioned Preview Exists');
  const hasPreview = previewGate ? previewGate.status === 'pass' : false;

  // Find owner valid
  const affiliateGate = dto.gateChecks?.find((g: any) => g.label === 'Affiliate Link Valid');
  const ownerValid = affiliateGate ? affiliateGate.status === 'pass' : false;

  // Find report status
  const reportGate = dto.gateChecks?.find((g: any) => g.label === 'Publish Readiness Report Exists');
  const reportExists = reportGate ? reportGate.status === 'pass' : false;

  const platforms: Record<string, PlatformPublishState> = {};
  for (const p of ['facebook', 'tiktok', 'youtube']) {
    let status: PublishPlatformStatus = 'WAIT_PACKAGE';
    if (isPackaged) {
      status = 'READY';
    } else if (isApproved) {
      status = 'WAIT_PACKAGE';
    } else {
      status = 'BLOCKED';
    }

    platforms[p] = {
      status,
      channel: dto.suggestedChannel || 'Kênh Review Sản Phẩm #1',
      packageFile: isPackaged ? `${dto.jobId}_production_package.zip` : null,
      packageSize: isPackaged ? '3.49 MB' : null,
      captionReady: hasPreview,
      thumbnailReady: isPackaged,
      affiliateLinkReady: ownerValid,
      scheduledAt: isPackaged ? 'Đợi lên lịch' : null,
    };
  }

  return {
    id: dto.jobId,
    title: dto.productName || dto.jobId,
    laneId: dto.laneId || 'review',
    product: dto.productName || dto.jobId,
    productPrice: isApproved ? '₫699.000' : '₫0', // or sanitized price
    affiliateLink: `https://shp.ee/sku?aff=${SHOPEE_OWNER}`,
    duration: '00:45',
    format: '9:16 vertical',
    qaPassed,
    approved: isApproved,
    ownerValid,
    captionReady: hasPreview,
    voiceBgmReady: true,
    durationValid: true,
    safeAreaOk: true,
    platforms: platforms as any,
  };
}

/**
 * B + C + D + E — phần tương tác: chọn nội dung trong hàng đợi → hiện chi tiết,
 * card publish từng nền tảng và gate checklist của nội dung đó.
 * Nối dữ liệu thật qua API read-only — KHÔNG publish thật.
 */
export function PublishCommandCenter() {
  const [items, setItems] = useState<PublishContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/studio/publish-queue')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        if (data.success && Array.isArray(data.items)) {
          const mapped = data.items.map(mapDtoToPublishContent);
          setItems(mapped);
          if (mapped.length > 0) {
            setSelectedId(mapped[0].id);
          }
        } else {
          throw new Error(data.error || 'Failed to load publish queue');
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || String(err));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const selected = items.find((c) => c.id === selectedId) ?? items[0];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-hairline bg-card/40 py-16 text-center">
        <span className="animate-spin text-accent-green mb-4">
          <UtilIcon name="clock" width={32} height={32} />
        </span>
        <p className="text-sm text-neutral-400">Đang tải dữ liệu từ hàng đợi thật...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-accent-rose/20 bg-accent-rose/5 px-6 py-8 text-center text-accent-rose space-y-3">
        <span className="inline-block mx-auto">
          <UtilIcon name="x" width={32} height={32} />
        </span>
        <h4 className="text-sm font-semibold">Lỗi đồng bộ hàng đợi xuất bản</h4>
        <p className="text-xs text-neutral-400 font-mono">{error}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-hairline bg-card/20 py-12 text-center text-neutral-500 italic space-y-2">
        <p>Không tìm thấy Job nào trong trạng thái Review/Approved/Packaged.</p>
        <p className="text-xs text-neutral-600">Vui lòng phê duyệt một số Job tại Overview Dashboard trước.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PublishQueueTable items={items} selectedId={selected.id} onSelect={setSelectedId} />

      <SelectedPublishContent content={selected} />

      <div>
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          Publish từng nền tảng — chế độ kiểm định an toàn (Dry-Run / Read-only)
        </p>
        <div className="grid gap-4 lg:grid-cols-3">
          {PLATFORMS.map((p) => (
            <PlatformPublishCard key={p.id} content={selected} platform={p.id} />
          ))}
        </div>
      </div>

      <PublishGateChecklist content={selected} />
    </div>
  );
}
