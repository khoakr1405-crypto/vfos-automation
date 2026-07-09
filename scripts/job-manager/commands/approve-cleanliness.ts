// `approve-cleanliness` command (extracted from scripts/vfos-job-manager.ts —
// God-file anatomy Nhịp 3). Byte-identical move; logic (incl. existing `any`
// casts) unchanged per Operator "chỉ di chuyển vị trí địa lý".

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { isoNow, loadManifest, saveManifest } from '../core/manifest-io.js';
import { extractProductName } from '../core/product-card.js';
import {
  entryFromManifest,
  loadRegistry,
  saveRegistry,
  upsertRegistryEntry,
} from '../core/registry-io.js';

// DEPRECATED (Option A — 5-step model): the human source-approval gate was
// removed from the Product Review Command Center. `intake-clean` now marks a
// real downloaded source clean automatically; the Operator's visual review is at
// preview (Step 4). This CLI remains only as a manual recovery/override tool and
// is NOT wired into the Studio UI. Do not reintroduce it as a workflow gate.
export async function cmdApproveCleanliness(args: string[]): Promise<number> {
  const parsed = parseArgs({
    args,
    options: {
      job: { type: 'string' },
      status: { type: 'string' },
      notes: { type: 'string' },
    },
    allowPositionals: false,
    strict: true,
  });

  const jobId = parsed.values.job as string | undefined;
  const status = parsed.values.status as string | undefined;
  const notes = parsed.values.notes as string | undefined;

  if (!jobId) {
    console.error('Error: --job <jobId> is required');
    return 1;
  }
  if (!status || (status !== 'pass' && status !== 'fail')) {
    console.error('Error: --status pass|fail is required');
    return 1;
  }
  if (!notes || !notes.trim()) {
    console.error('Error: --notes "<operator notes>" is required and cannot be empty.');
    return 1;
  }

  const manifest = loadManifest(jobId);
  if (!manifest) {
    console.error(`🛑 UNKNOWN_JOB: ${jobId}`);
    return 2;
  }

  // GUARD: KHÔNG cho duyệt SẠCH một nguồn fallback/demo. Nguồn mẫu chỉ phục vụ
  // dev — không bao giờ được approve làm nguồn sạch của job THẬT (No-Go). Defense
  // cho job cũ đã nhiễm fallback: phải nạp lại nguồn thật trước khi duyệt.
  const srcMode = (manifest.source as any).sourceMode ?? null;
  const prodAllowed = (manifest.source as any).productionAllowed ?? null;
  if (status === 'pass' && (srcMode === 'fallback' || prodAllowed === false)) {
    console.error('🛑 SOURCE_IS_FALLBACK: Không thể duyệt sạch nguồn fallback/demo.');
    console.error(`sourceMode:         ${srcMode ?? '(none)'}`);
    console.error('Nạp lại nguồn thật (URL đúng hoặc --file) rồi mới duyệt nguồn sạch.');
    return 13;
  }

  const jobSourceDir = resolve(`runs/${jobId}/source`);
  const finalVideoPath = join(jobSourceDir, 'clean_source_video.mp4');
  const cleanlinessReportPath = join(jobSourceDir, 'source_cleanliness_report.json');

  // 1. Verify existence of clean_source_video.mp4
  if (!existsSync(finalVideoPath)) {
    console.error(
      `🛑 CLEAN_SOURCE_VIDEO_NOT_FOUND: runs/${jobId}/source/clean_source_video.mp4 does not exist.`,
    );
    return 10;
  }

  // 2. Verify existence of source_cleanliness_report.json
  if (!existsSync(cleanlinessReportPath)) {
    console.error(
      `🛑 CLEANLINESS_REPORT_NOT_FOUND: runs/${jobId}/source/source_cleanliness_report.json does not exist.`,
    );
    return 11;
  }

  // 3. Read existing report
  let cleanlinessReport: any;
  try {
    cleanlinessReport = JSON.parse(readFileSync(cleanlinessReportPath, 'utf8'));
  } catch (err: any) {
    console.error(`🛑 CLEANLINESS_REPORT_UNREADABLE: Failed to parse ${cleanlinessReportPath}.`);
    return 12;
  }

  const previousStatus = cleanlinessReport.status || 'UNKNOWN_NEEDS_OPERATOR_REVIEW';

  // 4. Frame paths validation
  const framePaths: string[] = cleanlinessReport.framePaths || [];
  for (const fp of framePaths) {
    const fullFramePath = resolve(fp);
    if (!existsSync(fullFramePath)) {
      console.warn(`⚠️ [Warning] Extracted frame path is missing in local runtime: ${fp}`);
    }
  }

  // 5. Update history & report fields
  const toStatus = status === 'pass' ? 'WATERMARK_NOT_DETECTED' : 'WATERMARK_DETECTED';

  if (!cleanlinessReport.reviewHistory) {
    cleanlinessReport.reviewHistory = [];
  }

  cleanlinessReport.reviewHistory.push({
    at: isoNow(),
    action: status === 'pass' ? 'OPERATOR_APPROVE_CLEANLINESS' : 'OPERATOR_REJECT_CLEANLINESS',
    fromStatus: previousStatus,
    toStatus: toStatus,
    notes: notes.trim(),
  });

  cleanlinessReport.status = toStatus;
  cleanlinessReport.operatorManualReview = {
    status: status === 'pass' ? 'PASS' : 'FAIL',
    reviewedBy: 'operator',
    reviewedAt: isoNow(),
    notes: notes.trim(),
  };

  cleanlinessReport.agentFrameExtraction = {
    status: 'PASS',
    frameCount: framePaths.length,
  };

  cleanlinessReport.agentAutomatedVision = {
    status: 'NOT_IMPLEMENTED',
  };

  cleanlinessReport.detectedWatermarks = [];

  // Write updated report back
  writeFileSync(cleanlinessReportPath, JSON.stringify(cleanlinessReport, null, 2), 'utf8');

  // 6. Update Manifest & Registry cleanlinessStatus
  (manifest.source as any).cleanlinessStatus = toStatus;
  if (status === 'pass') {
    // Only restore/heal FAILED state to SOURCE_READY if the failure was cleanliness-related
    const hasCleanlinessFailure =
      manifest.lastError &&
      (manifest.lastError.includes('WATERMARK_DETECTED') ||
        manifest.lastError.includes('CLEANLINESS_NOT_APPROVED') ||
        manifest.lastError.includes('SOURCE_NOT_READY') ||
        manifest.lastError.includes('cleanliness') ||
        manifest.lastError.includes('watermark'));
    if (manifest.state === 'FAILED' && hasCleanlinessFailure) {
      manifest.state = 'SOURCE_READY';
      manifest.lastError = null;
    }
  } else {
    manifest.state = 'FAILED';
    manifest.lastError = `WATERMARK_DETECTED: Cleanliness review rejected by operator. Notes: ${notes.trim()}`;
  }
  saveManifest(manifest);

  const reg = loadRegistry();
  const productCardRaw = JSON.parse(
    readFileSync(resolve(manifest.source.productCardPath), 'utf8'),
  ) as Record<string, unknown>;
  upsertRegistryEntry(reg, entryFromManifest(manifest, extractProductName(productCardRaw)));
  saveRegistry(reg);

  // 7. Output Result
  if (status === 'pass') {
    console.log('======================================================');
    console.log('✅ Cleanliness approval saved.');
    console.log(`Job:             ${jobId}`);
    console.log(`Previous status: ${previousStatus}`);
    console.log(`New status:      ${toStatus}`);
    console.log(`Report:          runs/${jobId}/source/source_cleanliness_report.json`);
    console.log(`Job state:       ${manifest.state}`);
    console.log('======================================================');
  } else {
    console.log('======================================================');
    console.log('🛑 Cleanliness rejection saved.');
    console.log(`Job:             ${jobId}`);
    console.log(`Previous status: ${previousStatus}`);
    console.log(`New status:      ${toStatus}`);
    console.log('Pipeline should not continue until source is replaced or re-approved.');
    console.log('======================================================');
  }

  return 0;
}
