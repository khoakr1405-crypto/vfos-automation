// Operator To-Do — pure read-only aggregation for the Dashboard band (Phase 2A).
//
// Gom "việc Operator cần làm bây giờ" từ 2 lane (Product Review + Entertainment)
// thành các bucket + đếm số, phục vụ 1 surface hợp nhất trên Dashboard (app/page.tsx).
//
// Phase 2A: bucket THEO job.state (mirror logic đếm của các status panel sẵn có —
// số phải reconcile được với panel cũ). KHÔNG gọi buildGateCheck per-job ở đây
// (tránh N lần đọc manifest mỗi lần load Dashboard). Bucket BLOCKED và MISSING dẫn
// từ gate rollup sẽ tinh chỉnh ở Phase 2B; mỗi dòng đã có nút "Kiểm tra gate"
// (drawer read-only) để xem blocker on-demand.
//
// Read-only thuần: input là mảng job đã fetch, output là bucket + đếm. Không I/O,
// không mock, không mutate.

import type { EntJobStatusUi } from '@/lib/entertainment/status';
import type { OperatorJobDTO, VfosJobState } from '@/lib/studio-data/types';

export type TodoBucket =
  | 'BLOCKED'
  | 'FAILED'
  | 'READY_FOR_REVIEW'
  | 'READY_TO_PUBLISH'
  | 'READY_TO_PACKAGE'
  | 'MISSING';

export type TodoLane = 'product-review' | 'entertainment';

export interface TodoItem {
  jobId: string;
  lane: TodoLane;
  laneLabel: string;
  laneHref: string;
  bucket: TodoBucket;
  state: string;
  label: string;
  updatedAt: string | null;
}

export interface TodoResult {
  items: TodoItem[];
  counts: Record<TodoBucket, number>;
  totalActionable: number;
}

export type TodoAccent = 'rose' | 'amber' | 'cyan' | 'green' | 'neutral';

// Thứ tự ưu tiên đầy đủ (dùng để SẮP XẾP items). BLOCKED đứng đầu để sẵn sàng cho
// Phase 2B; hiện chưa có state nào map ra BLOCKED nên không có item BLOCKED.
export const TODO_BUCKET_ORDER: TodoBucket[] = [
  'BLOCKED',
  'FAILED',
  'READY_FOR_REVIEW',
  'READY_TO_PUBLISH',
  'READY_TO_PACKAGE',
  'MISSING',
];

// Bucket dẫn từ job.state THẬT — count strip CHỈ hiển thị các bucket này (Phase 2A).
// BLOCKED (gate rollup) chưa aggregate ở 2A nên KHÔNG hiển thị chip (tránh hiểu nhầm
// "0 = không có job bị chặn"). Gate blocker xem per-job qua nút "Kiểm tra gate".
export const TODO_STATE_BUCKET_ORDER: TodoBucket[] = [
  'FAILED',
  'READY_FOR_REVIEW',
  'READY_TO_PUBLISH',
  'READY_TO_PACKAGE',
  'MISSING',
];

export const TODO_BUCKET_LABEL: Record<TodoBucket, string> = {
  BLOCKED: 'Bị chặn',
  FAILED: 'Lỗi',
  READY_FOR_REVIEW: 'Chờ duyệt',
  READY_TO_PUBLISH: 'Chờ đăng',
  READY_TO_PACKAGE: 'Chờ đóng gói',
  MISSING: 'Thiếu nguồn',
};

export const TODO_BUCKET_ACCENT: Record<TodoBucket, TodoAccent> = {
  BLOCKED: 'rose',
  FAILED: 'rose',
  READY_FOR_REVIEW: 'amber',
  READY_TO_PUBLISH: 'cyan',
  READY_TO_PACKAGE: 'green',
  MISSING: 'amber',
};

// Product Review (VfosJobState) → bucket. State không liệt kê = in-flight (hệ thống
// đang chạy: SOURCE_READY/READY_TO_RENDER/RENDERING) hoặc terminal (PUBLISHED/REJECTED)
// → KHÔNG phải to-do.
const PR_BUCKET: Partial<Record<VfosJobState, TodoBucket>> = {
  FAILED: 'FAILED',
  CREATED: 'MISSING',
  WAITING_FOR_SOURCE_VIDEO: 'MISSING',
  READY_FOR_OPERATOR_REVIEW: 'READY_FOR_REVIEW',
  APPROVED: 'READY_TO_PACKAGE',
  PACKAGED: 'READY_TO_PUBLISH',
};

// Entertainment (EntJobState) → bucket. SCRIPT_PENDING là cổng kỹ thuật nội bộ
// (agent tự PASS theo No-Go #8) → coi là in-flight, KHÔNG phải to-do của Operator.
// Các state in-flight khác: INTAKE_RUNNING/INTAKE_DONE/ANALYZED/MONTAGE_READY/
// SCRIPT_APPROVED/TIKTOK_POSTING. Terminal: TIKTOK_POSTED.
const ENT_BUCKET: Partial<Record<string, TodoBucket>> = {
  INTAKE_FAILED: 'FAILED',
  TIKTOK_FAILED: 'FAILED',
  PREVIEW_PENDING: 'READY_FOR_REVIEW',
  APPROVED: 'READY_TO_PACKAGE',
  PACKAGED: 'READY_TO_PUBLISH',
};

function emptyCounts(): Record<TodoBucket, number> {
  return {
    BLOCKED: 0,
    FAILED: 0,
    READY_FOR_REVIEW: 0,
    READY_TO_PUBLISH: 0,
    READY_TO_PACKAGE: 0,
    MISSING: 0,
  };
}

/**
 * Gom job 2 lane thành danh sách to-do đã sắp ưu tiên + đếm theo bucket.
 * Pure: cùng input → cùng output; không đọc file, không gọi API.
 */
export function buildOperatorTodo(prJobs: OperatorJobDTO[], entJobs: EntJobStatusUi[]): TodoResult {
  const items: TodoItem[] = [];

  for (const j of prJobs) {
    const bucket = PR_BUCKET[j.state];
    if (!bucket) continue;
    items.push({
      jobId: j.id,
      lane: 'product-review',
      laneLabel: 'Review Sản phẩm',
      laneHref: '/lanes/product-review',
      bucket,
      state: j.state,
      label: j.product || j.title || j.id,
      updatedAt: j.updatedAt ?? null,
    });
  }

  for (const j of entJobs) {
    const bucket = ENT_BUCKET[j.state];
    if (!bucket) continue;
    items.push({
      jobId: j.jobId,
      lane: 'entertainment',
      laneLabel: 'Nội dung / Giải trí',
      laneHref: '/lanes/content',
      bucket,
      state: j.state,
      label: j.channelNiche ?? j.niche ?? j.jobId,
      updatedAt: j.updatedAt ?? null,
    });
  }

  const counts = emptyCounts();
  for (const it of items) counts[it.bucket] += 1;

  const rank = (b: TodoBucket): number => TODO_BUCKET_ORDER.indexOf(b);
  items.sort((a, b) => {
    const r = rank(a.bucket) - rank(b.bucket);
    if (r !== 0) return r;
    // Cùng bucket: chờ lâu nhất (updatedAt cũ nhất) lên trước.
    return (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '');
  });

  return { items, counts, totalActionable: items.length };
}
