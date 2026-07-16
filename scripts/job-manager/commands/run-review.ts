// `run-review` command (Round 53) — extracted from scripts/vfos-job-manager.ts,
// God-file anatomy Nhịp cuối. Byte-identical move; logic unchanged.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadManifest, saveManifest } from '../core/manifest-io.js';
import { JOBS_ROOT, OPERATOR_VIDEO_INBOX, VALID_VIDEO_EXTS } from '../core/paths.js';
import { extractProductName } from '../core/product-card.js';
import {
  entryFromManifest,
  loadRegistry,
  saveRegistry,
  upsertRegistryEntry,
} from '../core/registry-io.js';

export async function cmdRunReview(args: string[]): Promise<number> {
  const parsed = parseArgs({
    args,
    options: {
      job: { type: 'string' },
      file: { type: 'string' },
      'confirm-ai': { type: 'boolean', default: false },
      'confirm-openai': { type: 'boolean', default: false },
      'confirm-elevenlabs': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      // Voice picker: female=HoaiMy / male=NamMinh — forward xuống orchestrator.
      voice: { type: 'string' },
    },
    allowPositionals: false,
    strict: true,
  });

  const jobId = parsed.values.job as string | undefined;
  const file = parsed.values.file as string | undefined;
  const confirmAi = Boolean(parsed.values['confirm-ai']);
  const confirmOpenai = Boolean(parsed.values['confirm-openai']) || confirmAi;
  const confirmElevenlabs = Boolean(parsed.values['confirm-elevenlabs']) || confirmAi;
  const dryRun = Boolean(parsed.values['dry-run']);
  const voice =
    parsed.values.voice === 'female' || parsed.values.voice === 'male'
      ? (parsed.values.voice as 'female' | 'male')
      : null;

  if (!jobId) {
    console.error('Error: --job <jobId> is required');
    return 1;
  }

  const manifest = loadManifest(jobId);
  if (!manifest) {
    console.error(`🛑 UNKNOWN_JOB: ${jobId}`);
    return 2;
  }

  // Gate check (Rule 5): Block production if source is fallback/demo.
  // Canonical predicate mirrors isFallbackSource() in
  // apps/studio/src/lib/studio-data/production-gates.ts (SSOT). Scripts replicate
  // the one-liner instead of importing across the workspace boundary.
  const sourceMode = (manifest.source as any).sourceMode ?? null;
  const productionAllowed = (manifest.source as any).productionAllowed ?? null;
  if (sourceMode === 'fallback' || productionAllowed === false) {
    console.error('======================================================');
    console.error(
      '🛑 PIPELINE_GATE_BLOCKED: Source is fallback/demo, not allowed for real production.',
    );
    console.error(`Job ID:             ${jobId}`);
    console.error(`sourceMode:         ${sourceMode ?? '(none)'}`);
    console.error(`productionAllowed:  ${productionAllowed === false ? 'false' : '(unset)'}`);
    console.error(
      'Fallback source is review/dev only. Attach a real approved source before production.',
    );
    console.error('======================================================');
    return 21;
  }

  // Gate check (Rule 4): Block pipeline if source cleanliness is not verified
  const cleanlinessStatus = (manifest.source as any).cleanlinessStatus;
  if (cleanlinessStatus !== 'WATERMARK_NOT_DETECTED') {
    console.error('======================================================');
    console.error(
      '🛑 PIPELINE_GATE_BLOCKED: Source video cleanliness review is pending or failed.',
    );
    console.error(`Job ID:             ${jobId}`);
    console.error(`Cleanliness Status: ${cleanlinessStatus ?? 'UNKNOWN_NEEDS_OPERATOR_REVIEW'}`);
    console.error(
      'Operator must approve cleanliness using the following command before continuing:',
    );
    console.error(
      `  pnpm source:approve-cleanliness --job ${jobId} --status pass --notes "<operator notes>"`,
    );
    console.error('======================================================');
    return 20;
  }

  // Gate check (Phần 77): Block pipeline if source is hardsub text-heavy —
  // chữ CJK ngoài vùng che được, scrub không cứu → cấm production tuyệt đối.
  if (manifest.source.textDensityStatus === 'TEXT_HEAVY') {
    console.error('======================================================');
    console.error('🛑 PIPELINE_GATE_BLOCKED: Source video is HARDSUB_TEXT_HEAVY.');
    console.error(`Job ID:             ${jobId}`);
    console.error('Chữ CJK cứng nằm ngoài vùng che được (giữa/trên khung hình) —');
    console.error('scrub/delogo không xử lý được. Chọn video nguồn khác cho job mới.');
    console.error('======================================================');
    return 22;
  }

  if (!file) {
    console.error('Error: --file <video> is required');
    return 3;
  }

  // 1. Resolve file path: accept full path or check operator video inbox
  let sourcePath = resolve(file);
  if (!existsSync(sourcePath)) {
    const inboxCandidate = resolve(OPERATOR_VIDEO_INBOX, file);
    if (existsSync(inboxCandidate)) {
      sourcePath = inboxCandidate;
    } else {
      console.error(`🛑 MISSING_SOURCE_VIDEO: ${file}`);
      console.error(`  Not found as a path, nor in ${OPERATOR_VIDEO_INBOX}/`);
      return 3;
    }
  }

  const ext = extname(sourcePath).toLowerCase();
  if (!VALID_VIDEO_EXTS.has(ext)) {
    console.error(
      `🛑 UNSUPPORTED_VIDEO_EXT: ${ext} (allowed: ${[...VALID_VIDEO_EXTS].join(', ')})`,
    );
    return 4;
  }

  let sizeBytes = 0;
  try {
    sizeBytes = statSync(sourcePath).size;
  } catch {
    sizeBytes = 0;
  }

  const destPath = resolve(JOBS_ROOT, jobId, `source_video${ext}`);
  const destRel = `${JOBS_ROOT}/${jobId}/source_video${ext}`;

  console.log('======================================================');
  console.log(`📎  VFOS Job Manager — run-review  ${dryRun ? '🔍 DRY-RUN' : '⚡ EXECUTE'}`);
  console.log('======================================================');
  console.log(`Job ID:            ${jobId}`);
  console.log(`Source file:       ${file}`);
  console.log(`Resolved path:     ${sourcePath}`);
  console.log(`Size:              ${sizeBytes} bytes`);
  console.log(`Destination:       ${destRel}`);
  console.log(`New state:         READY_TO_RENDER`);
  console.log('------------------------------------------------------');

  if (dryRun) {
    console.log('Dry-run: would attach source video and launch pipeline.');
  } else {
    // 2. Attach source video into job
    copyFileSync(sourcePath, destPath);
    manifest.source.sourceVideoPath = destRel;
    manifest.state = 'READY_TO_RENDER';
    saveManifest(manifest);

    const reg = loadRegistry();
    // Video-first job (Trend Scout) có thể chưa gắn card → productName null.
    const productName = manifest.source.productCardPath
      ? extractProductName(
          JSON.parse(readFileSync(resolve(manifest.source.productCardPath), 'utf8')) as Record<
            string,
            unknown
          >,
        )
      : null;
    upsertRegistryEntry(reg, entryFromManifest(manifest, productName));
    saveRegistry(reg);
    console.log(`✅ Source attached. State → READY_TO_RENDER`);
  }

  // 3. Verify job state is READY_TO_RENDER
  if (!dryRun && manifest.state !== 'READY_TO_RENDER') {
    console.error(`🛑 INVALID_STATE: expected READY_TO_RENDER, got ${manifest.state}`);
    return 5;
  }

  // 4. Run unified pipeline
  console.log('\n[Orchestrator] Running unified review video generation pipeline...');
  const reviewArgs = ['--job', jobId];
  if (confirmOpenai) reviewArgs.push('--confirm-openai');
  if (confirmElevenlabs) reviewArgs.push('--confirm-elevenlabs');
  if (dryRun) reviewArgs.push('--dry-run');
  if (voice) reviewArgs.push('--voice', voice);

  const reviewRes = spawnSync(
    'npx',
    ['tsx', 'scripts/review-video-orchestrator.ts', ...reviewArgs],
    {
      shell: true,
      stdio: 'inherit',
    },
  );

  const reviewExit = reviewRes.status ?? 1;
  if (reviewExit !== 0) {
    console.error(`❌ [Orchestrator] Pipeline execution failed with exit code ${reviewExit}.`);
    return reviewExit;
  }

  if (!dryRun) {
    console.log('\n======================================================');
    console.log('🎉 UNIFIED REVIEW VIDEO GENERATION COMPLETED');
    console.log('======================================================');
    console.log(`Output:      data/temp/jobs/${jobId}/preview_with_captions_v2.mp4`);
    console.log(`To open:     start "" "data\\temp\\jobs\\${jobId}\\preview_with_captions_v2.mp4"`);
    console.log('======================================================');
  }

  return 0;
}
