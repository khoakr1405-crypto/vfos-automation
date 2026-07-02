/* =============================================================================
 * GET /api/studio/overview/todo — Operator To-Do aggregation (Phase 2B-1)
 * -----------------------------------------------------------------------------
 * READ-ONLY. Gom job actionable 2 lane + gate rollup THẬT để phân loại bucket
 * (kể cả BLOCKED). KHÔNG side effect, KHÔNG mutate, KHÔNG pipeline/render/publish.
 *
 * Luồng:
 *   1) loadOperatorJobs() (PR) + listEntStatusForUi() (Ent) — loader read-only sẵn có.
 *   2) buildOperatorTodo(...) không gate → lấy tập ACTIONABLE + thứ tự ưu tiên.
 *   3) buildGateCheck(jobId) CHỈ cho actionable jobs, cap GATE_CHECK_CAP (30).
 *      Mỗi call bọc try/catch: job lỗi gate → bỏ qua (KHÔNG giả BLOCKED=0).
 *   4) buildOperatorTodo(..., gateMap) → phân loại lại với precedence gate.
 *   5) Trả TodoResult + gateComputed/gateCapped/capNote (no silent cap).
 * ========================================================================== */

import { listEntStatusForUi } from '@/lib/entertainment/status';
import { buildGateCheck } from '@/lib/gate-check/build-gate-check';
import { type GateRollup, buildOperatorTodo } from '@/lib/overview/operator-todo';
import { loadOperatorJobs } from '@/lib/studio-data/jobs';

export const dynamic = 'force-dynamic';

// Cap số job gate-check mỗi lần load Dashboard (buildGateCheck đọc file/job → I/O).
const GATE_CHECK_CAP = 30;

const CAP_NOTE = 'Một số job chưa được tính gate do giới hạn hiệu năng.';

export function GET() {
  try {
    const prJobs = loadOperatorJobs();
    const entJobs = listEntStatusForUi();

    // Tập actionable (theo state) + thứ tự ưu tiên — dùng để chọn job gate-check.
    const base = buildOperatorTodo(prJobs, entJobs);
    const actionableIds = base.items.map((it) => it.jobId);
    const gateCapped = actionableIds.length > GATE_CHECK_CAP;
    const toGate = actionableIds.slice(0, GATE_CHECK_CAP);

    // Gate rollup THẬT cho từng actionable job (capped). Lỗi 1 job không phá cả batch.
    const gateMap = new Map<string, GateRollup>();
    for (const id of toGate) {
      try {
        const r = buildGateCheck(id);
        if (r.ok) gateMap.set(id, { overallStatus: r.overallStatus, blocker: r.blocker });
      } catch {
        // Không tính được gate cho job này → bỏ qua, phân loại theo state (không giả BLOCKED).
      }
    }

    const result = buildOperatorTodo(prJobs, entJobs, gateMap);

    return Response.json({
      ok: true,
      source: 'real',
      ...result,
      gateComputed: gateMap.size,
      gateCapped,
      capNote: gateCapped ? CAP_NOTE : null,
    });
  } catch {
    const empty = buildOperatorTodo([], []);
    return Response.json(
      {
        ok: false,
        source: 'real',
        ...empty,
        gateComputed: 0,
        gateCapped: false,
        capNote: null,
        error: 'TODO_READ_FAILED',
      },
      { status: 200 },
    );
  }
}
