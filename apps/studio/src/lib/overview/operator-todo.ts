// Operator To-Do — pure read-only aggregation for the Dashboard band.
//
// Gom "việc Operator cần làm bây giờ" từ 2 lane (Product Review + Entertainment)
// thành các bucket + đếm số, phục vụ 1 surface hợp nhất trên Dashboard (app/page.tsx).
//
// Phase 2A: bucket THEO job.state.
// Phase 2B-1: nhận thêm gate rollup THẬT (overallStatus/blocker từ buildGateCheck,
// tính server-side ở route /api/studio/overview/todo) để phân loại BLOCKED/FAILED
// chính xác. Hàm này PURE (không I/O): route lo việc gọi buildGateCheck + cap, rồi
// truyền gateMap vào đây. Module KHÔNG import buildGateCheck (server-only) — chỉ
// nhận dữ liệu gate đã tính, nên an toàn dùng chung client + server.
//
// Read-only thuần: input là mảng job (+gateMap), output là bucket + đếm. Không mock,
// không mutate.

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

// Gate rollup đã tính (từ buildGateCheck) cho 1 job. overallStatus để string cho
// module không phụ thuộc build-gate-check (server-only).
export interface GateRollup {
  overallStatus: string;
  blocker: string | null;
}

export interface TodoItem {
  jobId: string;
  lane: TodoLane;
  laneLabel: string;
  laneHref: string;
  bucket: TodoBucket;
  state: string;
  label: string;
  updatedAt: string | null;
  blocker: string | null;
}

// Output thuần của buildOperatorTodo (không có meta gate).
export interface TodoBuckets {
  items: TodoItem[];
  counts: Record<TodoBucket, number>;
  totalActionable: number;
}

// Contract route trả về / component đọc: TodoBuckets + meta về việc tính gate.
export interface TodoResult extends TodoBuckets {
  gateComputed: number; // số job đã tính gate rollup thật (0 → KHÔNG hiện chip BLOCKED)
  gateCapped: boolean; // có job actionable chưa được tính gate vì cap không
  capNote: string | null;
}

export type TodoAccent = 'rose' | 'amber' | 'cyan' | 'green' | 'neutral';

// Thứ tự ưu tiên đầy đủ — dùng để SẮP XẾP items và render count strip.
export const TODO_BUCKET_ORDER: TodoBucket[] = [
  'BLOCKED',
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

// --- Severity metadata (Phase 2B-2, UI-only) --------------------------------
// Gom bucket thành 3 tier để nhấn mạnh mức ưu tiên trên Dashboard. THUẦN metadata:
// KHÔNG đổi count/precedence/data — component tự derive tổng tier từ `counts` sẵn có.
export type TodoSeverity = 'critical' | 'action' | 'missing';

// Thứ tự tier trên band: nguy cấp trước.
export const TODO_SEVERITY_ORDER: TodoSeverity[] = ['critical', 'action', 'missing'];

// Bucket nào thuộc tier nào. Khớp precedence/màu: BLOCKED+FAILED = nguy cấp.
export const TODO_BUCKET_SEVERITY: Record<TodoBucket, TodoSeverity> = {
  BLOCKED: 'critical',
  FAILED: 'critical',
  READY_FOR_REVIEW: 'action',
  READY_TO_PUBLISH: 'action',
  READY_TO_PACKAGE: 'action',
  MISSING: 'missing',
};

export const TODO_SEVERITY_LABEL: Record<TodoSeverity, string> = {
  critical: 'Nguy cấp',
  action: 'Cần thao tác',
  missing: 'Thiếu nguồn',
};

// Tone của header tier: critical = rose (nóng, nổi bật nhất), action = cyan, missing = amber.
export const TODO_SEVERITY_ACCENT: Record<TodoSeverity, TodoAccent> = {
  critical: 'rose',
  action: 'cyan',
  missing: 'amber',
};

// Product Review (VfosJobState) → bucket theo state. State không liệt kê = in-flight
// (SOURCE_READY/READY_TO_RENDER/RENDERING) hoặc terminal (PUBLISHED/REJECTED) → KHÔNG to-do.
const PR_BUCKET: Partial<Record<VfosJobState, TodoBucket>> = {
  FAILED: 'FAILED',
  CREATED: 'MISSING',
  WAITING_FOR_SOURCE_VIDEO: 'MISSING',
  READY_FOR_OPERATOR_REVIEW: 'READY_FOR_REVIEW',
  APPROVED: 'READY_TO_PACKAGE',
  PACKAGED: 'READY_TO_PUBLISH',
};

// Entertainment (EntJobState) → bucket theo state. SCRIPT_PENDING = cổng kỹ thuật nội bộ
// (agent tự PASS, No-Go #8) → in-flight. In-flight khác: INTAKE_RUNNING/INTAKE_DONE/
// ANALYZED/MONTAGE_READY/SCRIPT_APPROVED/TIKTOK_POSTING. Terminal: TIKTOK_POSTED.
const ENT_BUCKET: Partial<Record<string, TodoBucket>> = {
  INTAKE_FAILED: 'FAILED',
  TIKTOK_FAILED: 'FAILED',
  PREVIEW_PENDING: 'READY_FOR_REVIEW',
  APPROVED: 'READY_TO_PACKAGE',
  PACKAGED: 'READY_TO_PUBLISH',
};

// Precedence: gate BLOCKED > (state FAILED | gate FAIL) > READY_FOR_REVIEW >
// READY_TO_PUBLISH > READY_TO_PACKAGE > (state MISSING | gate MISSING). Trả bucket
// đầu tiên khớp → mỗi job đúng 1 bucket, không double-count. Trả undefined nếu job
// không actionable (không có state bucket và gate không BLOCKED).
function classify(
  stateBucket: TodoBucket | undefined,
  gateStatus: string | undefined,
): TodoBucket | undefined {
  if (gateStatus === 'BLOCKED') return 'BLOCKED';
  if (stateBucket === 'FAILED' || gateStatus === 'FAIL') return 'FAILED';
  if (stateBucket === 'READY_FOR_REVIEW') return 'READY_FOR_REVIEW';
  if (stateBucket === 'READY_TO_PUBLISH') return 'READY_TO_PUBLISH';
  if (stateBucket === 'READY_TO_PACKAGE') return 'READY_TO_PACKAGE';
  if (stateBucket === 'MISSING' || gateStatus === 'MISSING') return 'MISSING';
  return undefined;
}

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
 *
 * gateMap (optional): map jobId → gate rollup đã tính. Không truyền → phân loại
 * thuần theo state (Phase 2A behavior, không có BLOCKED). Truyền → áp precedence
 * gate (Phase 2B-1). gateMap chỉ nên chứa job đã thực sự tính được gate — job không
 * có entry sẽ phân loại theo state (KHÔNG giả BLOCKED).
 */
export function buildOperatorTodo(
  prJobs: OperatorJobDTO[],
  entJobs: EntJobStatusUi[],
  gateMap?: Map<string, GateRollup>,
): TodoBuckets {
  const gm = gateMap ?? new Map<string, GateRollup>();
  const items: TodoItem[] = [];

  for (const j of prJobs) {
    const gate = gm.get(j.id);
    const bucket = classify(PR_BUCKET[j.state], gate?.overallStatus);
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
      blocker: gate?.blocker ?? null,
    });
  }

  for (const j of entJobs) {
    const gate = gm.get(j.jobId);
    const bucket = classify(ENT_BUCKET[j.state], gate?.overallStatus);
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
      blocker: gate?.blocker ?? null,
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
