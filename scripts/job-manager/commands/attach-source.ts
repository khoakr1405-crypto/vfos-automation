// `attach-source` command (extracted from scripts/vfos-job-manager.ts — God-file
// anatomy Nhịp 3). Byte-identical move; logic unchanged.

import { copyFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { printInboxListing } from '../core/inbox.js';
import { loadManifest, saveManifest } from '../core/manifest-io.js';
import { JOBS_ROOT, OPERATOR_VIDEO_INBOX, VALID_VIDEO_EXTS } from '../core/paths.js';
import { extractProductName } from '../core/product-card.js';
import {
  entryFromManifest,
  loadRegistry,
  saveRegistry,
  upsertRegistryEntry,
} from '../core/registry-io.js';

export function cmdAttachSource(args: string[]): number {
  const parsed = parseArgs({
    args,
    options: {
      job: { type: 'string' },
      file: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  const jobId = parsed.values.job as string | undefined;
  const filePath = parsed.values.file as string | undefined;
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

  // No --file: show the operator inbox so the Operator can pick one. We never
  // auto-attach (even with a single file) — the choice stays with the Operator.
  if (!filePath) {
    console.log('======================================================');
    console.log('📎  VFOS Job Manager — attach-source (no --file given)');
    console.log('======================================================');
    console.log(`Job ID:            ${jobId}`);
    console.log('------------------------------------------------------');
    printInboxListing(jobId);
    return 0;
  }

  // Resolve the file: accept an absolute/relative path as-is, otherwise fall
  // back to a bare filename inside the operator video inbox (the default place
  // the Operator drops downloaded source videos).
  let sourcePath = resolve(filePath);
  if (!existsSync(sourcePath)) {
    const inboxCandidate = resolve(OPERATOR_VIDEO_INBOX, filePath);
    if (existsSync(inboxCandidate)) {
      sourcePath = inboxCandidate;
    } else {
      console.error(`🛑 MISSING_SOURCE_VIDEO: ${filePath}`);
      console.error(`  Not found as a path, nor in ${OPERATOR_VIDEO_INBOX}/`);
      console.error('------------------------------------------------------');
      printInboxListing(jobId);
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
  console.log(`📎  VFOS Job Manager — attach-source  ${dryRun ? '🔍 DRY-RUN' : '⚡ EXECUTE'}`);
  console.log('======================================================');
  console.log(`Job ID:            ${jobId}`);
  console.log(`Source file:       ${filePath}`);
  console.log(`Size:              ${sizeBytes} bytes`);
  console.log(`Destination:       ${destRel}`);
  console.log(`New state:         READY_TO_RENDER`);
  console.log('------------------------------------------------------');

  if (dryRun) {
    console.log('Dry-run: no file copied, no manifest mutation, no registry update.');
    return 0;
  }

  copyFileSync(sourcePath, destPath);
  manifest.source.sourceVideoPath = destRel;
  manifest.state = 'READY_TO_RENDER';
  saveManifest(manifest);

  const reg = loadRegistry();
  const productCardRaw = JSON.parse(
    readFileSync(resolve(manifest.source.productCardPath), 'utf8'),
  ) as Record<string, unknown>;
  upsertRegistryEntry(reg, entryFromManifest(manifest, extractProductName(productCardRaw)));
  saveRegistry(reg);

  console.log(`✅ Source attached. State → READY_TO_RENDER`);
  return 0;
}
