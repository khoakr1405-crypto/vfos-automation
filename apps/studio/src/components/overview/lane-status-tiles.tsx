'use client';

import { PanelBadge, PanelShell } from '@/components/overview/panel-shell';
import { type PipelineStep, PipelineStepCards } from '@/components/overview/pipeline-step-cards';
import type { OperatorJobDTO, VfosJobState } from '@/lib/studio-data/types';
import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * LaneStatusTiles — khối "Trạng thái lane" của màn Tổng quan (redesign concept
 * 07/2026). Bọc <PipelineStepCards> với COUNT THẬT gom từ state job lane Review
 * Sản phẩm (GET /api/studio/jobs, read-only — cùng route OverviewKpiRow đang
 * dùng, KHÔNG route mới, KHÔNG mock).
 *
 * Map 10-state machine → 6 bước Operator hiểu (khớp nhãn ProcessStrip). FAILED /
 * REJECTED KHÔNG nằm trong 6 bước xuôi dòng → không cộng vào (không bịa).
 */

// state (10-state) → 1 trong 6 bước pipeline concept. FAILED/REJECTED = null (loại).
const STATE_TO_STEP: Record<VfosJobState, number | null> = {
  CREATED: 1,
  WAITING_FOR_SOURCE_VIDEO: 2,
  SOURCE_READY: 2,
  READY_TO_RENDER: 3,
  RENDERING: 3,
  READY_FOR_OPERATOR_REVIEW: 4,
  APPROVED: 5,
  PACKAGED: 5,
  PUBLISHED: 6,
  REJECTED: null,
  FAILED: null,
};

const STEP_DEFS: Array<Omit<PipelineStep, 'count'>> = [
  { no: 1, label: 'Sản phẩm', accent: 'green', sub: 'chờ dựng' },
  { no: 2, label: 'Nguồn sạch', accent: 'blue', sub: 'chờ nguồn' },
  { no: 3, label: 'Sản xuất + QA', accent: 'violet', sub: 'tiến trình' },
  { no: 4, label: 'Duyệt preview', accent: 'amber', sub: 'chờ duyệt' },
  { no: 5, label: 'Đóng gói', accent: 'cyan', sub: 'sẵn sàng' },
  { no: 6, label: 'Đã đăng', accent: 'green', sub: 'đã đăng' },
];

export function LaneStatusTiles() {
  const [steps, setSteps] = useState<PipelineStep[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/studio/jobs');
        const data = (await res.json()) as { jobs?: OperatorJobDTO[]; source?: string };
        if (!alive) return;
        // Read-only: chỉ nhận data THẬT; nếu không phải real thì count = 0 (không bịa).
        const jobs = data.source === 'real' && Array.isArray(data.jobs) ? data.jobs : [];
        const counts = new Map<number, number>();
        for (const j of jobs) {
          const step = STATE_TO_STEP[j.state];
          if (step != null) counts.set(step, (counts.get(step) ?? 0) + 1);
        }
        setSteps(STEP_DEFS.map((d) => ({ ...d, count: counts.get(d.no) ?? 0 })));
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <PanelShell
      accent="cyan"
      title="Trạng thái lane — Review Sản phẩm"
      subtitle="Đếm thật theo bước pipeline · FAILED/REJECTED không tính"
      right={
        <Link href="/lanes/product-review">
          <PanelBadge>Xem toàn bộ →</PanelBadge>
        </Link>
      }
    >
      {steps === null && !error ? (
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6" aria-hidden>
          {['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5', 'sk-6'].map((k) => (
            <div
              key={k}
              className="h-[92px] animate-pulse rounded-xl border border-hairline/40 bg-panel/60"
            />
          ))}
        </div>
      ) : error ? (
        <p className="rounded-lg border border-accent-rose/25 bg-accent-rose/5 px-3 py-2 text-xs text-accent-rose">
          Không đọc được trạng thái lane. Tải lại trang để thử lại.
        </p>
      ) : (
        <PipelineStepCards steps={steps ?? []} />
      )}
    </PanelShell>
  );
}
