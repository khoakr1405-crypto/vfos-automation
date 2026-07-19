// H21 — SUCCESS finalize (verbatim move từ review-video-orchestrator dòng
// 1888–1932). Job mode: trỏ artifacts + state READY_FOR_OPERATOR_REVIEW +
// registry. Ghi status artifact cuối + banner. Exit 0.

import { applyApprovalMutation } from '../../core/approval.js';
import { saveManifest } from '../../core/manifest-io.js';
import { JOBS_ROOT } from '../../core/paths.js';
import { updateRegistryFromManifest } from '../../core/registry-io.js';
import { type PipelineContext, VIDEO_FIXTURE_PATH, VOICE_FIXTURE_PATH } from '../context.js';
import { printDivider, printHeader } from '../run-step.js';
import { writeStatusArtifact } from '../status-artifact.js';

export function finalizeStep(ctx: PipelineContext): void {
  const { jobId, preset, runId } = ctx;

  if (jobId && ctx.jobManifest) {
    // Job mode: paths point to job folder.
    const previewRel = `${JOBS_ROOT}/${jobId}/preview.mp4`;
    const captionedRel = `${JOBS_ROOT}/${jobId}/preview_with_captions${preset === 'viral_review_v2' ? '_v2' : ''}.mp4`;
    ctx.jobManifest.artifacts.previewVideoPath = previewRel;
    ctx.jobManifest.artifacts.captionedPreviewPath = captionedRel;
    ctx.jobManifest.state = 'READY_FOR_OPERATOR_REVIEW';
    // Success finalize: mọi gate đã PASS → xoá vệt lỗi FAILED cũ (vd VOICE_LONGER_
    // THAN_VIDEO của run trước) để state READY không mang lastError lạc.
    ctx.jobManifest.lastError = null;
    saveManifest(ctx.jobManifest);
    updateRegistryFromManifest(ctx.jobManifest);
  }

  // Common status-artifact fields (shared by every terminal branch below).
  const statusBase = {
    ...ctx.baseArtifact,
    elevenLabsApiCalled: ctx.elevenLabsApiCalled,
    chayExecuted: ctx.chayExecuted,
    captionExecuted: ctx.captionExecuted,
    outputVideoPath: ctx.outputExists ? ctx.expectedOutput : null,
    previewArtifact: ctx.previewArtifact,
  };

  // ---- Phần 82 — nhánh cổng AI auto-approve (verdict null = gate off → hành vi cũ) ----
  const verdict = ctx.autoApproveVerdict;
  if (jobId && ctx.jobManifest && verdict === 'PASS') {
    // Cổng AI duyệt PASS → thực hiện đúng mutation của cmdApprove (thay click tay).
    applyApprovalMutation(ctx.jobManifest, 'AUTO_APPROVE PASS v1 (Phần 82)');
    writeStatusArtifact({ ...statusBase, state: 'AUTO_APPROVED' });
    console.log('');
    printHeader('🤖 VFOS AUTO-APPROVED (Phần 82)');
    console.log(`Job ID:           ${jobId}`);
    console.log(`Run ID:           ${runId}`);
    console.log('Cổng AI duyệt PASS → state=APPROVED (không cần click tay).');
    console.log('Hậu kiểm: Operator xem lại trên nền tảng sau khi đăng.');
    printDivider();
    process.exit(0);
  }
  if (jobId && ctx.jobManifest && (verdict === 'FAIL' || verdict === 'NEEDS_HUMAN')) {
    const st = verdict === 'FAIL' ? 'AUTO_APPROVE_REJECTED' : 'AUTO_APPROVE_NEEDS_HUMAN';
    // Giữ job ở READY_FOR_OPERATOR_REVIEW (đã set ở trên) — Operator duyệt tay như cũ.
    ctx.jobManifest.lastError = st;
    saveManifest(ctx.jobManifest);
    updateRegistryFromManifest(ctx.jobManifest);
    writeStatusArtifact({ ...statusBase, state: st });
    console.log('');
    printHeader('🤖 AUTO-APPROVE — GIỮ LẠI CHỜ NGƯỜI');
    console.log(`Job ID:           ${jobId}`);
    console.log(`Verdict:          ${verdict}`);
    console.log('Job giữ READY_FOR_OPERATOR_REVIEW — Operator duyệt tay (nút Duyệt) như cũ.');
    console.log(`Xem lý do:        data/temp/jobs/${jobId}/auto_approve/auto_approve_report.json`);
    printDivider();
    process.exit(verdict === 'FAIL' ? 24 : 25);
  }

  // ---- Nhánh mặc định (gate off / no-job) — hành vi READY như trước Phần 82 ----
  writeStatusArtifact({ ...statusBase, state: 'READY_FOR_OPERATOR_VIDEO_REVIEW' });

  console.log('');
  printHeader('🎬 VFOS REVIEW VIDEO READY');
  if (jobId) console.log(`Job ID:           ${jobId}`);
  console.log(`Run ID:           ${runId}`);
  console.log(
    `Video source:     ${jobId && ctx.jobSourceVideoAbs ? ctx.jobSourceVideoAbs : VIDEO_FIXTURE_PATH}`,
  );
  console.log(`Voice source:     ${jobId ? ctx.jobVoicePath : VOICE_FIXTURE_PATH}`);
  console.log(`Caption preset:   ${preset}`);
  console.log(`Output:           ${ctx.expectedOutput}`);
  if (jobId) {
    console.log('Job state:        READY_FOR_OPERATOR_REVIEW');
    console.log('Render mode:      NATIVE_JOB_FOLDER (no shared fixture bridge)');
  }
  console.log('');
  console.log('Required action:');
  console.log('Operator must watch this video before publish readiness.');
  if (jobId) {
    console.log('Unified pipeline gates passed: Vision → Script → BGM → Voice(coupled) →');
    console.log('Render → Caption → AudioGuard → BgmGuard → Final QA/STT. ✅');
  }
  printDivider();
  process.exit(0);
}
