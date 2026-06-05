'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { UtilIcon } from '../icons';

const LANE_INFO: Record<string, { label: string; ready: boolean }> = {
  'product-review': { label: 'Review Sản phẩm', ready: true },
  'fishing-vlog': { label: 'Vlog Về Câu cá', ready: false },
  'car-vlog': { label: 'Vlog Về xe', ready: false },
};

interface LaneBannerProps {
  lane?: string | null;
}

function LaneBannerInner({ lane }: { lane?: string | null }) {
  const searchParams = useSearchParams();
  const laneParam = lane || searchParams.get('lane');

  // If no lane parameter is specified, do not render the banner
  if (!laneParam) return null;

  const info = LANE_INFO[laneParam];
  const label = info?.label || laneParam;

  if (laneParam === 'product-review') {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-accent-amber/20 bg-accent-amber/5 p-3 text-xs">
        <Link
          href="/lanes/product-review"
          className="group flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-raised px-3 py-1.5 font-bold text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800 hover:text-neutral-100 transition shadow-sm"
        >
          <UtilIcon
            name="chevron"
            className="rotate-180 text-neutral-400 group-hover:text-neutral-200"
            width={10}
            height={10}
          />
          Quay lại Review Sản phẩm
        </Link>
        <div className="flex items-center gap-2 text-accent-amber font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-amber animate-pulse" />
          <span>Ngữ cảnh: {label}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-700/40 bg-raised/40 p-3 text-xs text-neutral-400">
      <span className="h-1.5 w-1.5 rounded-full bg-neutral-600" />
      <span>Ngữ cảnh: {label}</span>
      <span className="text-neutral-500">— đang chuẩn bị, chưa bật tạo job thật cho lane này</span>
    </div>
  );
}

export function LaneBanner({ lane }: LaneBannerProps) {
  // If lane is passed directly, we don't need Suspense or client hooks
  if (lane !== undefined) {
    return <LaneBannerInner lane={lane} />;
  }

  return (
    <Suspense>
      <LaneBannerInner />
    </Suspense>
  );
}
