// `status` command (extracted from scripts/vfos-job-manager.ts — God-file anatomy
// Nhịp 2). Behavior-preserving; only 2 no-interpolation template literals →
// string literals (biome noUnusedTemplateLiteral).

import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { exists, loadManifest } from '../core/manifest-io.js';
import { extractProductName } from '../core/product-card.js';

export function cmdStatus(args: string[]): number {
  const parsed = parseArgs({
    args,
    options: { job: { type: 'string' } },
    allowPositionals: false,
    strict: true,
  });
  const jobId = parsed.values.job as string | undefined;
  if (!jobId) {
    console.error('Error: --job <jobId> is required');
    return 1;
  }
  const manifest = loadManifest(jobId);
  if (!manifest) {
    console.error(`🛑 UNKNOWN_JOB: ${jobId}`);
    return 2;
  }
  const productCardPath = resolve(manifest.source.productCardPath);
  let productName: string | null = null;
  if (existsSync(productCardPath)) {
    try {
      const card = JSON.parse(readFileSync(productCardPath, 'utf8')) as Record<string, unknown>;
      productName = extractProductName(card);
    } catch {
      /* ignore */
    }
  }

  const srcPath = manifest.source.sourceVideoPath ? resolve(manifest.source.sourceVideoPath) : null;
  const previewPath = manifest.artifacts.previewVideoPath
    ? resolve(manifest.artifacts.previewVideoPath)
    : null;
  const captionedPath = manifest.artifacts.captionedPreviewPath
    ? resolve(manifest.artifacts.captionedPreviewPath)
    : null;
  const voicePath = manifest.artifacts.voiceArtifactPath
    ? resolve(manifest.artifacts.voiceArtifactPath)
    : null;

  const qaReportPath = manifest.artifacts.finalQaReportPath
    ? resolve(manifest.artifacts.finalQaReportPath)
    : null;

  console.log('======================================================');
  console.log(`🧾  VFOS Job Status — ${jobId}`);
  console.log('======================================================');
  console.log(`Run ID:            ${manifest.runId}`);
  console.log(`Product:           ${productName ?? '(unknown)'}`);
  console.log(`Product ID:        ${manifest.productId ?? '(unknown)'}`);
  console.log(`State:             ${manifest.state}`);
  console.log(`Operator decision: ${manifest.review.operatorDecision}`);
  console.log(`Approved at:       ${manifest.review.approvedAt ?? '(none)'}`);
  console.log(`Rejected at:       ${manifest.review.rejectedAt ?? '(none)'}`);
  console.log(`Review notes:      ${manifest.review.notes ?? '(none)'}`);
  console.log(`Final QA:          ${manifest.qaStatus ?? 'MISSING'}`);
  console.log('------------------------------------------------------');
  console.log(
    `Source video:      ${manifest.source.sourceVideoPath ?? '(none)'}  ${srcPath && exists(srcPath) ? '✅' : '❌'}`,
  );
  console.log(
    `Voice artifact:    ${manifest.artifacts.voiceArtifactPath ?? '(none)'}  ${voicePath && exists(voicePath) ? '✅' : '❌'}`,
  );
  console.log(
    `Preview video:     ${manifest.artifacts.previewVideoPath ?? '(none)'}  ${previewPath && exists(previewPath) ? '✅' : '❌'}`,
  );
  console.log(
    `Captioned preview: ${manifest.artifacts.captionedPreviewPath ?? '(none)'}  ${captionedPath && exists(captionedPath) ? '✅' : '❌'}`,
  );
  console.log(
    `QA Report:         ${manifest.artifacts.finalQaReportPath ?? '(none)'}  ${qaReportPath && exists(qaReportPath) ? '✅' : '❌'}`,
  );
  console.log(`Created at:        ${manifest.createdAt}`);
  console.log(`Updated at:        ${manifest.updatedAt}`);
  if (manifest.safety) {
    console.log(
      `Safety Lock:       Uploaded: ${manifest.safety.uploaded ? '✅' : '❌'} | Published: ${manifest.safety.published ? '✅' : '❌'} | API Called: ${manifest.safety.facebookApiCalled ? '✅' : '❌'}`,
    );
  }

  console.log('------------------------------------------------------');
  console.log('💡  RECOMMENDED NEXT ACTION:');
  if (manifest.state === 'WAITING_FOR_SOURCE_VIDEO') {
    console.log('  1. Drop a video file into: data/operator/video-downloads/');
    console.log(`  2. Check the inbox:        pnpm job:source-inbox --job ${jobId}`);
    console.log(
      `  3. Run review:             pnpm job:run-review --job ${jobId} --file "<video>.mp4" --confirm-ai`,
    );
  } else if (manifest.state === 'READY_TO_RENDER') {
    console.log(
      `  Run review pipeline:       pnpm job:run-review --job ${jobId} --file "${basename(manifest.source.sourceVideoPath || '')}" --confirm-ai`,
    );
  } else if (manifest.state === 'READY_FOR_OPERATOR_REVIEW') {
    console.log(
      `  1. Open and review:        start "" "data\\temp\\jobs\\${jobId}\\preview_with_captions_v2.mp4"`,
    );
    console.log(
      `  2. Approve it:             pnpm job:approve --job ${jobId} --notes "Operator reviewed and approved."`,
    );
    console.log(`  3. Or reject it:           pnpm job:reject --job ${jobId} --notes "<reason>"`);
  } else if (manifest.state === 'APPROVED') {
    console.log(`  Package the video:         pnpm job:package --job ${jobId}`);
  } else if (manifest.state === 'PACKAGED') {
    console.log(
      `  Review publish pack:       production/archive/${jobId}/publish_readiness_report.md`,
    );
    console.log('  Manual operators can now upload and publish.');
  } else {
    console.log(`  No specific recommendation for state: ${manifest.state}`);
  }
  console.log('======================================================');
  return 0;
}
