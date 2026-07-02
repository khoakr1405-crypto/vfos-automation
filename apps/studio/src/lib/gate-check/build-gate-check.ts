/* =============================================================================
 * VFOS Studio — shared gate-check builder (PR-C) — SERVER ONLY, READ-ONLY
 * -----------------------------------------------------------------------------
 * Thay logic slash command `/gate-check <jobId>` bằng 1 hàm dùng chung:
 * soi 1 job đang kẹt gate nào, vì sao — KHÔNG đụng pipeline, KHÔNG mutate.
 *
 * Auto-detect lane theo prefix:
 *   job_* → Product Review (loadJobById, pure-read DTO đã sanitize path/secret)
 *   ent_* → Entertainment  (readManifest, pure-read ent_job.json)
 * TUYỆT ĐỐI KHÔNG dùng getJobDetail() (writeManifest side-effect) và KHÔNG gọi
 * appendPublishAuditLog. Không đọc chéo lane. Không expose source URL/path/token.
 * ========================================================================== */

import { type EntJob, readManifest } from '@/lib/entertainment/jobs';
import { loadJobById } from '@/lib/studio-data/jobs';
import type { OperatorJobDTO } from '@/lib/studio-data/types';

export type GateCheckStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'PENDING' | 'MISSING' | 'UNKNOWN';

export interface GateCheckItem {
  key: string;
  label: string;
  status: GateCheckStatus;
  reason: string;
}

export interface GateCheckResult {
  ok: true;
  jobId: string;
  lane: 'product-review' | 'entertainment';
  state: string | null;
  overallStatus: GateCheckStatus;
  isPassing: boolean;
  gates: GateCheckItem[];
  blocker: string | null;
  updatedAt: string | null;
}

export type GateCheckErrorCode = 'JOB_NOT_FOUND' | 'UNSUPPORTED_JOB_ID_PREFIX' | 'INVALID_JOB_ID';
export interface GateCheckError {
  ok: false;
  code: GateCheckErrorCode;
}

const JOB_ID_RE = /^[A-Za-z0-9_-]+$/;

/** Roll-up overallStatus: BLOCKED > FAIL > PENDING > MISSING > (all PASS) > UNKNOWN. */
function rollup(gates: GateCheckItem[]): GateCheckStatus {
  const statuses = new Set(gates.map((g) => g.status));
  if (statuses.has('BLOCKED')) return 'BLOCKED';
  if (statuses.has('FAIL')) return 'FAIL';
  if (statuses.has('PENDING')) return 'PENDING';
  if (statuses.has('MISSING')) return 'MISSING';
  if (gates.length > 0 && gates.every((g) => g.status === 'PASS')) return 'PASS';
  return 'UNKNOWN';
}

// ── Product Review (job_*) ────────────────────────────────────────────────────

function buildProductReviewGates(job: OperatorJobDTO): {
  gates: GateCheckItem[];
  blocker: string | null;
} {
  const b = job.productBinding;
  const bindingStr = `shopId=${b.shopId ?? '—'} itemId=${b.itemId ?? '—'} shortLink=${b.shortLink ? 'có' : '—'}`;
  const hasCard = Boolean(job.ownerId || b.shopId || b.itemId || b.shortLink);

  const productBinding: GateCheckItem = {
    key: 'product_binding',
    label: 'Product binding / readiness',
    status: !hasCard ? 'MISSING' : job.ownerValid ? 'PASS' : 'BLOCKED',
    reason: !hasCard
      ? 'Chưa có Product Card bind vào job.'
      : job.ownerValid
        ? `Owner hợp lệ (${job.ownerId}); ${bindingStr}.`
        : `Owner chưa hợp lệ/VERIFIED (owner=${job.ownerId ?? '—'}); ${bindingStr}.`,
  };

  const productionAllowed = job.source?.productionAllowed !== false;
  const clean = job.cleanlinessStatus === 'WATERMARK_NOT_DETECTED';
  const sourceClean: GateCheckItem = {
    key: 'source_clean',
    label: 'Nguồn sạch / production allowed',
    status: !productionAllowed
      ? 'BLOCKED'
      : clean
        ? 'PASS'
        : job.cleanlinessStatus == null
          ? 'MISSING'
          : 'PENDING',
    reason: !productionAllowed
      ? `Nguồn fallback/không cho production (productionAllowed=false, sourceMode=${job.source?.sourceMode ?? '—'}).`
      : clean
        ? 'Nguồn đã duyệt sạch (WATERMARK_NOT_DETECTED).'
        : job.cleanlinessStatus == null
          ? 'Chưa có kết quả kiểm tra nguồn sạch.'
          : `Nguồn chưa sạch (cleanlinessStatus=${job.cleanlinessStatus}).`,
  };

  // FAILED = lỗi kỹ thuật production → BLOCKED tại pha production/render/QA, kèm lastError.
  const qaRender: GateCheckItem = {
    key: 'qa_render',
    label: 'Duration / render / QA',
    status:
      job.state === 'FAILED'
        ? 'BLOCKED'
        : job.qaStatus === 'PASS'
          ? 'PASS'
          : job.qaStatus === 'FAIL'
            ? 'FAIL'
            : job.qaStatus === 'PENDING'
              ? 'PENDING'
              : 'MISSING',
    reason:
      job.state === 'FAILED'
        ? `Job FAILED${job.errorLog?.error ? ` — ${job.errorLog.error}` : ''}.`
        : `qaStatus=${job.qaStatus ?? '—'}, preview=${job.hasPreview ? 'có' : '—'}, duration=${job.duration}.`,
  };

  const operatorPreview: GateCheckItem = {
    key: 'operator_preview',
    label: 'Operator preview',
    status:
      job.operatorDecision === 'APPROVED'
        ? 'PASS'
        : job.operatorDecision === 'REJECTED'
          ? 'FAIL'
          : 'PENDING',
    reason: `operatorDecision=${job.operatorDecision}.`,
  };

  const launchPublish: GateCheckItem = {
    key: 'launch_publish',
    label: 'Launch / package / publish',
    status:
      job.state === 'PUBLISHED' || job.state === 'PACKAGED'
        ? 'PASS'
        : job.state === 'APPROVED'
          ? 'PENDING'
          : 'PENDING',
    reason: `state=${job.state}.`,
  };

  return {
    gates: [productBinding, sourceClean, qaRender, operatorPreview, launchPublish],
    blocker: job.errorLog?.error ?? null,
  };
}

// ── Entertainment (ent_*) ─────────────────────────────────────────────────────

function verdictStatus(verdict: string | null): GateCheckStatus {
  if (verdict == null) return 'MISSING';
  const up = verdict.toUpperCase();
  if (up.includes('PASS') || up === 'OK') return 'PASS';
  if (up.includes('FAIL') || up.includes('BLOCK')) return 'FAIL';
  return 'UNKNOWN';
}

function buildEntertainmentGates(m: EntJob): { gates: GateCheckItem[]; blocker: string | null } {
  const errCode = m.error?.code ?? null;

  const intake: GateCheckItem = {
    key: 'intake',
    label: 'Intake / blocker',
    status:
      m.state === 'INTAKE_FAILED' ? 'BLOCKED' : m.state === 'INTAKE_RUNNING' ? 'PENDING' : 'PASS',
    reason:
      m.state === 'INTAKE_FAILED'
        ? `Intake thất bại${errCode ? ` — error.code=${errCode}` : ''}.`
        : m.state === 'INTAKE_RUNNING'
          ? 'Đang tải nguồn (intake running).'
          : `Intake xong (state=${m.state}).`,
  };

  const scriptApproved = m.reviewGates?.scriptApproved === true;
  const gate1: GateCheckItem = {
    key: 'gate1_script',
    label: 'GATE1 script',
    status: scriptApproved ? 'PASS' : m.script ? 'PENDING' : 'MISSING',
    reason: `scriptApproved=${scriptApproved}, reviewStatus=${m.script?.reviewStatus ?? '—'}.`,
  };

  const previewApproved = m.reviewGates?.previewApproved === true;
  const audioApplied = m.audio?.applied === true;
  const gate2: GateCheckItem = {
    key: 'gate2_preview_audio',
    label: 'GATE2 preview / audio',
    status: previewApproved
      ? 'PASS'
      : m.audio && !audioApplied
        ? 'BLOCKED'
        : m.render
          ? 'PENDING'
          : 'MISSING',
    reason: `previewApproved=${previewApproved}, audio.applied=${m.audio ? audioApplied : '—'}, package.audioPolicyApplied=${m.package?.audioPolicyApplied ?? '—'}.`,
  };

  const gate3: GateCheckItem = {
    key: 'gate3_render',
    label: 'GATE3 render',
    status: verdictStatus(m.render?.verdict ?? null),
    reason: `render.verdict=${m.render?.verdict ?? '—'}.`,
  };

  const core = [intake, gate1, gate2, gate3];
  const overall = rollup(core);
  const stuck = core.find((g) => g.status !== 'PASS');
  const conclusion: GateCheckItem = {
    key: 'conclusion',
    label: 'Kết luận',
    status: overall,
    reason: stuck
      ? `Điểm kẹt chính: ${stuck.label} (${stuck.status}).`
      : 'READY — tất cả gate PASS.',
  };

  return { gates: [...core, conclusion], blocker: errCode };
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

/**
 * Soi gate 1 job (READ-ONLY). Trả GateCheckResult (ok:true) kể cả khi gate fail/block
 * — `overallStatus`/`isPassing` mô tả kết quả gate; chỉ trả ok:false khi KHÔNG đọc
 * được job (id sai / prefix không hỗ trợ / không tồn tại).
 */
export function buildGateCheck(jobId: string): GateCheckResult | GateCheckError {
  if (!JOB_ID_RE.test(jobId)) return { ok: false, code: 'INVALID_JOB_ID' };

  if (jobId.startsWith('ent_')) {
    const m = readManifest(jobId);
    if (!m) return { ok: false, code: 'JOB_NOT_FOUND' };
    const { gates, blocker } = buildEntertainmentGates(m);
    const overallStatus = rollup(gates);
    return {
      ok: true,
      jobId,
      lane: 'entertainment',
      state: m.state ?? null,
      overallStatus,
      isPassing: overallStatus === 'PASS',
      gates,
      blocker,
      updatedAt: m.updatedAt ?? null,
    };
  }

  if (jobId.startsWith('job_')) {
    const job = loadJobById(jobId);
    if (!job) return { ok: false, code: 'JOB_NOT_FOUND' };
    const { gates, blocker } = buildProductReviewGates(job);
    const overallStatus = rollup(gates);
    return {
      ok: true,
      jobId,
      lane: 'product-review',
      state: job.state ?? null,
      overallStatus,
      isPassing: overallStatus === 'PASS',
      gates,
      blocker,
      updatedAt: job.updatedAt ?? null,
    };
  }

  return { ok: false, code: 'UNSUPPORTED_JOB_ID_PREFIX' };
}
