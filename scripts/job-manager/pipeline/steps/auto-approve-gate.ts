// Auto-Approve gate step (Phần 82) — sits between finalQaGate and finalizeStep.
//
// No-Go #3 relaxed by explicit Operator order: on the PASS branch this replaces the
// human approve click. The step is a thin orchestrator (the PR pipeline is synchronous
// and the AI work is async) — it spawns the `job:auto-approve` worker exactly like
// visionGate spawns job:vision, then reads the verdict from the report. finalizeStep
// performs the terminal mutation. VFOS_AUTO_APPROVE(_REVIEW)=off → no-op (finalize keeps
// today's READY_FOR_OPERATOR_REVIEW behavior). Fail-closed: an unreadable/missing report
// is treated as NEEDS_HUMAN, never PASS.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type AutoApproveVerdict, parseAutoApproveConfig } from '../../core/auto-approve-core.js';
import { JOBS_ROOT } from '../../core/paths.js';
import type { PipelineContext } from '../context.js';
import { runCommand } from '../run-step.js';

export function autoApproveGate(ctx: PipelineContext): void {
  if (!(ctx.jobId && ctx.jobManifest)) return;
  const cfg = parseAutoApproveConfig(process.env);
  if (!cfg.review) return; // gate off → finalize does today's manual-review behavior

  const { jobId } = ctx;
  console.log('\n======================================================');
  console.log('🤖  AUTO-APPROVE GATE (Phần 82) — cổng duyệt tự động lane Review');
  console.log('======================================================');

  const code = runCommand('AUTO-APPROVE — AI review', 'pnpm', [
    'job:auto-approve',
    '--job',
    jobId,
    '--confirm-openai',
    '--lane',
    'review',
    '--run-id',
    ctx.runId,
  ]);
  ctx.reloadManifest(); // worker may have written product_ref etc.; keep memory fresh

  // Verdict source of truth = the report (fail-closed). Exit code is a cross-check only.
  const reportPath = join(JOBS_ROOT, jobId, 'auto_approve', 'auto_approve_report.json');
  let verdict: AutoApproveVerdict = 'NEEDS_HUMAN';
  try {
    const r = JSON.parse(readFileSync(reportPath, 'utf8')) as { verdict?: string };
    if (r.verdict === 'PASS' || r.verdict === 'FAIL' || r.verdict === 'NEEDS_HUMAN') {
      verdict = r.verdict;
    }
  } catch {
    console.log('⚠ auto_approve_report.json không đọc được → NEEDS_HUMAN (fail-closed).');
  }
  // Defensive: if the worker signalled FAIL (24) but the report says PASS, keep the more
  // conservative verdict — an exception path must never upgrade to PASS.
  if (verdict === 'PASS' && code !== 0) verdict = 'NEEDS_HUMAN';

  ctx.autoApproveVerdict = verdict;
  console.log(`AUTO-APPROVE verdict: ${verdict}  (worker exit ${code})`);
}
