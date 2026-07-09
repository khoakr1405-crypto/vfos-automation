// `approve` command (Round 45) — extracted from scripts/vfos-job-manager.ts,
// God-file anatomy Nhịp cuối. Byte-identical move; logic unchanged.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { isoNow, loadManifest, saveManifest } from '../core/manifest-io.js';
import {
  entryFromManifest,
  loadRegistry,
  productNameFromManifest,
  saveRegistry,
  upsertRegistryEntry,
} from '../core/registry-io.js';
import { readFinalQaStatus } from '../core/validation.js';

export function cmdApprove(args: string[]): number {
  const parsed = parseArgs({
    args,
    options: {
      job: { type: 'string' },
      notes: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  const jobId = parsed.values.job as string | undefined;
  const notes = ((parsed.values.notes as string | undefined) ?? '').trim() || null;
  const dryRun = Boolean(parsed.values['dry-run']);

  if (!jobId) {
    console.error('Error: --job <jobId> is required');
    return 1;
  }

  const manifest = loadManifest(jobId);
  if (!manifest) {
    console.error(`🛑 UNKNOWN_JOB: ${jobId}`);
    return 2;
  }

  console.log('======================================================');
  console.log(`✅  VFOS Job Manager — approve  ${dryRun ? '🔍 DRY-RUN' : '⚡ EXECUTE'}`);
  console.log('======================================================');
  console.log(`Job ID:            ${jobId}`);
  console.log(`Current state:     ${manifest.state}`);
  console.log(`Current decision:  ${manifest.review.operatorDecision}`);

  // Gate 1: only a job awaiting operator review can be approved.
  if (manifest.state !== 'READY_FOR_OPERATOR_REVIEW') {
    if (manifest.state === 'APPROVED') {
      console.error('🛑 ALREADY_APPROVED: job is already APPROVED.');
    } else {
      console.error(
        `🛑 INVALID_STATE_FOR_APPROVE: expected READY_FOR_OPERATOR_REVIEW, got ${manifest.state}.`,
      );
    }
    return 3;
  }

  // Gate 2: a reviewable captioned preview must exist on disk.
  const captionedRel = manifest.artifacts.captionedPreviewPath;
  const captionedAbs = captionedRel ? resolve(captionedRel) : null;
  if (!captionedAbs || !existsSync(captionedAbs)) {
    console.error('🛑 CAPTIONED_PREVIEW_MISSING: no captioned preview artifact to review.');
    console.error('  Run the review/caption flow before approving.');
    return 4;
  }

  // Gate 3: final QA must exist and PASS — never approve unverified output.
  const qa = readFinalQaStatus(manifest);
  if (qa === 'MISSING') {
    console.error('🛑 FINAL_QA_MISSING: no passing final_video_qa_report.json for this job.');
    console.error(`  Run: pnpm job:qa --job ${jobId} --confirm-openai`);
    return 5;
  }
  if (qa === 'FAIL') {
    console.error('🛑 FINAL_QA_NOT_PASSING: final QA status is FAIL. Cannot approve.');
    return 6;
  }

  console.log(`Captioned preview: ${captionedRel}  ✅`);
  console.log(`Final QA:          PASS ✅`);
  console.log(`Notes:             ${notes ?? '(none)'}`);
  console.log(`New state:         APPROVED`);
  console.log('------------------------------------------------------');

  if (dryRun) {
    console.log('Dry-run: no manifest mutation, no registry update. (No publish.)');
    return 0;
  }

  manifest.state = 'APPROVED';
  manifest.review = {
    operatorDecision: 'APPROVED',
    approvedAt: isoNow(),
    rejectedAt: null,
    notes,
  };
  saveManifest(manifest);

  const reg = loadRegistry();
  upsertRegistryEntry(reg, entryFromManifest(manifest, productNameFromManifest(manifest)));
  saveRegistry(reg);

  console.log('✅ Job APPROVED. (No publish — operator must publish manually.)');
  return 0;
}
