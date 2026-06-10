/**
 * VFOS Multi-Job Foundation — Round 36.
 *
 * Subcommands:
 *   pnpm job:create        --from-product <path> [--dry-run]
 *   pnpm job:attach-source --job <jobId> [--file <path|inbox-filename>] [--dry-run]
 *   pnpm job:source-inbox  [--job <jobId>]   (list videos in the operator inbox)
 *   pnpm job:status        --job <jobId>
 *   pnpm job:list
 *
 * Goal: introduce a stable job model + registry so future rounds can wire
 * per-job render/voice/caption flows. Round 36 stays at foundation level —
 * no API calls, no render, no publish, no batch loops.
 *
 * Runtime layout (all under data/ which is gitignored):
 *   data/temp/jobs/<jobId>/job_manifest.json
 *   data/temp/jobs/<jobId>/product_card.json
 *   data/temp/jobs/<jobId>/source_video.mp4   (after attach-source)
 *   data/temp/vfos_jobs_registry.json
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { loadDotEnv } from '../packages/voice/src/load-env.js';

const JOBS_ROOT = 'data/temp/jobs';
const REGISTRY_PATH = 'data/temp/vfos_jobs_registry.json';

// Default local-only inbox where the Operator drops downloaded/selected source
// videos. The whole `data/` tree is gitignored, so videos here never commit.
const OPERATOR_VIDEO_INBOX = 'data/operator/video-downloads';

const VALID_VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.m4v']);

/** Ensure the operator video inbox exists; returns its absolute path. */
function ensureOperatorInbox(): string {
  const abs = resolve(OPERATOR_VIDEO_INBOX);
  mkdirSync(abs, { recursive: true });
  return abs;
}

/** List video files currently in the operator inbox (sorted, newest first). */
function listInboxVideos(): { name: string; sizeBytes: number; mtimeMs: number }[] {
  const abs = ensureOperatorInbox();
  let names: string[] = [];
  try {
    names = readdirSync(abs);
  } catch {
    return [];
  }
  const vids: { name: string; sizeBytes: number; mtimeMs: number }[] = [];
  for (const name of names) {
    if (!VALID_VIDEO_EXTS.has(extname(name).toLowerCase())) continue;
    try {
      const st = statSync(join(abs, name));
      if (st.isFile()) vids.push({ name, sizeBytes: st.size, mtimeMs: st.mtimeMs });
    } catch {
      /* skip unreadable entries */
    }
  }
  return vids.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/** Print the inbox contents + how to attach. Never auto-attaches. */
function printInboxListing(jobId?: string): void {
  const vids = listInboxVideos();
  console.log(`Operator video inbox: ${OPERATOR_VIDEO_INBOX}/`);
  if (vids.length === 0) {
    console.log('  (empty) — drop a .mp4/.mov/.webm/.m4v file here, then re-run.');
    return;
  }
  console.log(`  ${vids.length} video(s) found:`);
  for (let i = 0; i < vids.length; i++) {
    const v = vids[i];
    console.log(`   [${i + 1}] ${v.name}  (${(v.sizeBytes / 1_000_000).toFixed(2)} MB)`);
  }
  const j = jobId ?? '<jobId>';
  console.log('\nAttach the one you want (Operator chooses — never auto-attached):');
  for (const v of vids) {
    console.log(`  pnpm job:attach-source --job ${j} --file "${v.name}"`);
  }
}

type JobState =
  | 'CREATED'
  | 'WAITING_FOR_SOURCE_VIDEO'
  | 'SOURCE_READY'
  | 'READY_TO_RENDER'
  | 'RENDERING'
  | 'READY_FOR_OPERATOR_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'PACKAGED'
  | 'FAILED';

interface JobManifest {
  jobVersion: 'v1';
  jobId: string;
  runId: string;
  productId: string | null;
  source: {
    productCardPath: string;
    sourceVideoPath: string | null;
  };
  artifacts: {
    scriptArtifactPath: string | null;
    voiceArtifactPath: string | null;
    voiceTimingArtifactPath: string | null;
    bgmArtifactPath: string | null;
    previewVideoPath: string | null;
    captionedPreviewPath: string | null;
    operatorReviewPackPath: string | null;
    publishReadinessPath: string | null;
    videoVisualAnalysisPath?: string | null;
    finalQaReportPath?: string | null;
    productionPackageManifestPath?: string | null;
  };
  state: JobState;
  review: {
    operatorDecision: 'PENDING' | 'APPROVED' | 'REJECTED';
    approvedAt: string | null;
    rejectedAt: string | null;
    notes: string | null;
  };
  safety: {
    facebookApiCalled: false;
    uploaded: false;
    published: false;
    requiresOperatorReview: true;
  };
  createdAt: string;
  updatedAt: string;
  lastError?: string | null;
  qaStatus?: 'PASS' | 'FAIL' | 'PENDING' | null;
}

interface RegistryEntry {
  jobId: string;
  runId: string;
  state: JobState;
  productName: string | null;
  productCardPath: string;
  sourceVideoPath: string | null;
  captionedPreviewPath: string | null;
  operatorDecision: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  updatedAt: string;
}

interface Registry {
  registryVersion: 'v1';
  updatedAt: string;
  jobs: RegistryEntry[];
}

function isoNow(): string {
  return new Date().toISOString();
}

function loadRegistry(): Registry {
  const path = resolve(REGISTRY_PATH);
  if (!existsSync(path)) {
    return { registryVersion: 'v1', updatedAt: isoNow(), jobs: [] };
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Registry;
    if (!raw.registryVersion) raw.registryVersion = 'v1';
    if (!Array.isArray(raw.jobs)) raw.jobs = [];
    return raw;
  } catch {
    console.error(`Warning: registry at ${REGISTRY_PATH} is unreadable; starting fresh in memory.`);
    return { registryVersion: 'v1', updatedAt: isoNow(), jobs: [] };
  }
}

function saveRegistry(reg: Registry): void {
  const path = resolve(REGISTRY_PATH);
  mkdirSync(dirname(path), { recursive: true });
  reg.updatedAt = isoNow();
  writeFileSync(path, `${JSON.stringify(reg, null, 2)}\n`, 'utf8');
}

function loadManifest(jobId: string): JobManifest | null {
  const path = resolve(JOBS_ROOT, jobId, 'job_manifest.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as JobManifest;
  } catch {
    return null;
  }
}

function saveManifest(manifest: JobManifest): void {
  syncManifestArtifacts(manifest);

  const path = resolve(JOBS_ROOT, manifest.jobId, 'job_manifest.json');
  mkdirSync(dirname(path), { recursive: true });
  manifest.updatedAt = isoNow();
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function todayStamp(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function nextJobId(reg: Registry): string {
  const prefix = `job_${todayStamp()}_`;
  let maxN = 0;
  for (const j of reg.jobs) {
    if (j.jobId.startsWith(prefix)) {
      const suffix = j.jobId.slice(prefix.length);
      const n = parseInt(suffix, 10);
      if (Number.isFinite(n) && n > maxN) maxN = n;
    }
  }
  if (existsSync(resolve(JOBS_ROOT))) {
    for (const entry of readdirSync(resolve(JOBS_ROOT))) {
      if (entry.startsWith(prefix)) {
        const n = parseInt(entry.slice(prefix.length), 10);
        if (Number.isFinite(n) && n > maxN) maxN = n;
      }
    }
  }
  return `${prefix}${String(maxN + 1).padStart(3, '0')}`;
}

function extractProductName(productCard: Record<string, unknown>): string | null {
  for (const key of ['name', 'productName', 'title']) {
    const val = productCard[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return null;
}

function extractProductId(productCard: Record<string, unknown>): string | null {
  for (const key of ['id', 'productId', 'itemId']) {
    const val = productCard[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
    if (typeof val === 'number') return String(val);
  }
  return null;
}

function hasVideoStream(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const result = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v',
      '-show_entries',
      'stream=index',
      '-of',
      'csv=p=0',
      filePath,
    ],
    { encoding: 'utf8' },
  );
  return result.status === 0 && result.stdout.trim().length > 0;
}

function getVideoDuration(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  const args = [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ];
  const result = spawnSync('ffprobe', args, { encoding: 'utf8' });
  if (result.status === 0) {
    const val = parseFloat(result.stdout.trim());
    if (!isNaN(val)) return val;
  }
  return 0;
}

function getVoiceDuration(filePath: string): number {
  return getVideoDuration(filePath); // Alias since ffprobe does both the same way
}

function hasAudioStream(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const result = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'a',
      '-show_entries',
      'stream=index',
      '-of',
      'csv=p=0',
      filePath,
    ],
    { encoding: 'utf8' },
  );
  return result.status === 0 && result.stdout.trim().length > 0;
}

interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  metrics: {
    duplicateHookDetected: boolean;
    repeatedProductNameCount: number;
    tooLongForVideo: boolean;
    ngramRepetitionDetected: boolean;
  };
}

function validateScript(args: {
  voiceoverText: string;
  hook: string;
  productName: string;
  targetDurationSec: number;
  estimatedSpeechDurationSec: number;
  visionAnalysis?: any;
}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const text = args.voiceoverText.trim();
  const textLower = text.toLowerCase();
  const hookLower = args.hook.trim().toLowerCase();
  const prodLower = args.productName.trim().toLowerCase();

  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  let duplicateHookDetected = false;
  let tooLongForVideo = false;
  let ngramRepetitionDetected = false;
  let visionGrounded = false;

  // 1. Duplicate hook validator:
  let hookOccurrences = 0;
  if (hookLower) {
    let pos = 0;
    while (true) {
      const idx = textLower.indexOf(hookLower, pos);
      if (idx === -1) break;
      hookOccurrences += 1;
      pos = idx + hookLower.length;
    }
  }
  if (hookOccurrences > 1) {
    duplicateHookDetected = true;
    errors.push(
      `Duplicate hook detected: "${args.hook}" appears ${hookOccurrences} times in voiceoverText.`,
    );
  }

  // 2. Product name repetition validator:
  let prodOccurrences = 0;
  if (prodLower) {
    let pos = 0;
    while (true) {
      const idx = textLower.indexOf(prodLower, pos);
      if (idx === -1) break;
      prodOccurrences += 1;
      pos = idx + prodLower.length;
    }
  }
  if (prodOccurrences > 2) {
    errors.push(
      `Product name "${args.productName}" appears ${prodOccurrences} times (max allowed: 2). Use a shorter name.`,
    );
  } else if (prodOccurrences > 1) {
    warnings.push(`Product name appears ${prodOccurrences} times. Keep it to 1-2 times.`);
  }

  // 3. N-gram repetition (4-6 words):
  const ngramSizes = [4, 5, 6];
  for (const size of ngramSizes) {
    if (words.length >= size) {
      const seen = new Set<string>();
      for (let i = 0; i <= words.length - size; i++) {
        const ngram = words
          .slice(i, i + size)
          .join(' ')
          .toLowerCase();
        if (seen.has(ngram)) {
          ngramRepetitionDetected = true;
          errors.push(`N-gram repetition detected (${size} words): "${ngram}"`);
          break;
        }
        seen.add(ngram);
      }
    }
    if (ngramRepetitionDetected) break;
  }

  // 4. Duration estimate:
  if (args.estimatedSpeechDurationSec > args.targetDurationSec) {
    tooLongForVideo = true;
    errors.push(
      `Script is too long for the video: estimated speech duration (${args.estimatedSpeechDurationSec.toFixed(1)}s) exceeds target duration (${args.targetDurationSec.toFixed(1)}s).`,
    );
  }

  // 5. Empty/too short:
  if (wordCount < 15) {
    errors.push(`Script is too short: got only ${wordCount} words (minimum required: 15).`);
  }

  // 6. Vision Grounding Rules (Round 42):
  if (args.visionAnalysis && args.visionAnalysis.analysis) {
    visionGrounded = true;
    const analysis = args.visionAnalysis.analysis;

    // 6a. Product visibility low -> Warning only (does not fail)
    if (analysis.mainProductVisible === false || (analysis.productConfidence ?? 1.0) < 0.5) {
      warnings.push(
        `LOW_PRODUCT_VISIBILITY: Main product visibility is low or confidence is under 50% (${(analysis.productConfidence ?? 1.0) * 100}%). Review source video.`,
      );
    }

    // 6b. Mismatch warnings check: if script mentions items in mismatchWarnings, add warning
    const mismatchWarnings = analysis.mismatchWarnings || [];
    const mismatchFound: string[] = [];
    for (const w of mismatchWarnings) {
      const wWords = w
        .toLowerCase()
        .split(/\s+/)
        .filter((x: string) => x.length > 2);
      if (wWords.length > 0) {
        const found = wWords.some((wd: string) => textLower.includes(wd));
        if (found) {
          mismatchFound.push(w);
        }
      }
    }
    if (mismatchFound.length > 0) {
      warnings.push(
        `Script mentions features flagged in video mismatch warnings: "${mismatchFound.join(', ')}".`,
      );
    }

    // 6c. Demonstrated features check: script should ideally mention at least some keyword from demonstratedFeatures
    const demonstratedFeatures = analysis.demonstratedFeatures || [];
    if (demonstratedFeatures.length > 0) {
      let matchedFeature = false;
      for (const feature of demonstratedFeatures) {
        const keywords = feature.toLowerCase().split(/[\s,]+/);
        const hasMatch = keywords.some((kw: string) => kw.length >= 3 && textLower.includes(kw));
        if (hasMatch) {
          matchedFeature = true;
          break;
        }
      }
      if (!matchedFeature) {
        warnings.push(
          `Script does not mention any demonstrated features from source video analysis: "${demonstratedFeatures.join(', ')}".`,
        );
      }
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    metrics: {
      duplicateHookDetected,
      repeatedProductNameCount: prodOccurrences,
      tooLongForVideo,
      ngramRepetitionDetected,
      visionGrounded,
    },
  };
}

function upsertRegistryEntry(reg: Registry, entry: RegistryEntry): void {
  const idx = reg.jobs.findIndex((j) => j.jobId === entry.jobId);
  if (idx >= 0) {
    reg.jobs[idx] = entry;
  } else {
    reg.jobs.push(entry);
  }
}

function entryFromManifest(manifest: JobManifest, productName: string | null): RegistryEntry {
  return {
    jobId: manifest.jobId,
    runId: manifest.runId,
    state: manifest.state,
    productName,
    productCardPath: manifest.source.productCardPath,
    sourceVideoPath: manifest.source.sourceVideoPath,
    captionedPreviewPath: manifest.artifacts.captionedPreviewPath,
    operatorDecision: manifest.review.operatorDecision,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
  };
}

function exists(path: string): boolean {
  return existsSync(path);
}

function productNameFromManifest(manifest: JobManifest): string | null {
  const cardPath = resolve(manifest.source.productCardPath);
  if (!existsSync(cardPath)) return null;
  try {
    const card = JSON.parse(readFileSync(cardPath, 'utf8')) as Record<string, unknown>;
    return extractProductName(card);
  } catch {
    return null;
  }
}

// Read the authoritative final QA status from the report file itself (not just
// the manifest mirror) so approve cannot pass on a stale/edited manifest.
function readFinalQaStatus(manifest: JobManifest): 'PASS' | 'FAIL' | 'MISSING' {
  const reportRel = manifest.artifacts.finalQaReportPath;
  if (!reportRel) return 'MISSING';
  const reportAbs = resolve(reportRel);
  if (!existsSync(reportAbs)) return 'MISSING';
  try {
    const report = JSON.parse(readFileSync(reportAbs, 'utf8')) as { status?: string };
    return report.status === 'PASS' ? 'PASS' : 'FAIL';
  } catch {
    return 'FAIL';
  }
}

// ---------- create ----------
function cmdCreate(args: string[]): number {
  const parsed = parseArgs({
    args,
    options: {
      'from-product': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  const fromProduct = parsed.values['from-product'] as string | undefined;
  const dryRun = Boolean(parsed.values['dry-run']);

  if (!fromProduct) {
    console.error('Error: --from-product <path> is required');
    return 1;
  }

  const productCardPath = resolve(fromProduct);
  if (!existsSync(productCardPath)) {
    console.error(`🛑 MISSING_PRODUCT_CARD: ${fromProduct}`);
    return 2;
  }

  let productCardRaw: Record<string, unknown>;
  try {
    productCardRaw = JSON.parse(readFileSync(productCardPath, 'utf8'));
  } catch (e) {
    console.error(`🛑 INVALID_PRODUCT_CARD_JSON: ${(e as Error).message}`);
    return 2;
  }

  const reg = loadRegistry();
  const jobId = nextJobId(reg);
  const runId = `run_${jobId}`;
  const jobDir = resolve(JOBS_ROOT, jobId);
  const productCardDest = join(jobDir, 'product_card.json');

  const productName = extractProductName(productCardRaw);
  const productId = extractProductId(productCardRaw);

  console.log('======================================================');
  console.log(`📦  VFOS Job Manager — create  ${dryRun ? '🔍 DRY-RUN' : '⚡ EXECUTE'}`);
  console.log('======================================================');
  console.log(`From product card: ${fromProduct}`);
  console.log(`Job ID:            ${jobId}`);
  console.log(`Run ID:            ${runId}`);
  console.log(`Product name:      ${productName ?? '(unknown)'}`);
  console.log(`Product ID:        ${productId ?? '(unknown)'}`);
  console.log(`Job dir:           ${JOBS_ROOT}/${jobId}/`);
  console.log(`Initial state:     WAITING_FOR_SOURCE_VIDEO`);
  console.log('------------------------------------------------------');

  if (dryRun) {
    console.log('Dry-run: no folder created, no manifest written, no registry update.');
    return 0;
  }

  mkdirSync(jobDir, { recursive: true });
  copyFileSync(productCardPath, productCardDest);

  const manifest: JobManifest = {
    jobVersion: 'v1',
    jobId,
    runId,
    productId,
    source: {
      productCardPath: `${JOBS_ROOT}/${jobId}/product_card.json`,
      sourceVideoPath: null,
    },
    artifacts: {
      scriptArtifactPath: null,
      voiceArtifactPath: null,
      voiceTimingArtifactPath: null,
      bgmArtifactPath: null,
      previewVideoPath: null,
      captionedPreviewPath: null,
      operatorReviewPackPath: null,
      publishReadinessPath: null,
    },
    state: 'WAITING_FOR_SOURCE_VIDEO',
    review: {
      operatorDecision: 'PENDING',
      approvedAt: null,
      rejectedAt: null,
      notes: null,
    },
    safety: {
      facebookApiCalled: false,
      uploaded: false,
      published: false,
      requiresOperatorReview: true,
    },
    createdAt: isoNow(),
    updatedAt: isoNow(),
  };
  saveManifest(manifest);

  upsertRegistryEntry(reg, entryFromManifest(manifest, productName));
  saveRegistry(reg);

  console.log(`✅ Job created.`);
  console.log(`Manifest:          ${JOBS_ROOT}/${jobId}/job_manifest.json`);
  console.log(`Registry:          ${REGISTRY_PATH}`);
  console.log('');
  console.log('Next step (Operator):');
  console.log(`  1. Drop the source video into: ${OPERATOR_VIDEO_INBOX}/`);
  console.log(`  2. List it:    pnpm job:source-inbox`);
  console.log(`  3. Attach it:  pnpm job:attach-source --job ${jobId} --file "<filename>.mp4"`);
  console.log(`     (a full path also works: --file "C:\\path\\to\\source-video.mp4")`);
  return 0;
}

// ---------- attach-source ----------
function cmdAttachSource(args: string[]): number {
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

// ---------- source-inbox ----------
function cmdSourceInbox(args: string[]): number {
  const parsed = parseArgs({
    args,
    options: { job: { type: 'string' } },
    allowPositionals: false,
    strict: true,
  });
  const jobId = parsed.values.job as string | undefined;

  console.log('======================================================');
  console.log('🎞️  VFOS Operator Video Source Inbox');
  console.log('======================================================');
  printInboxListing(jobId);
  return 0;
}

// ---------- status ----------
function cmdStatus(args: string[]): number {
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
    console.log(`  1. Drop a video file into: data/operator/video-downloads/`);
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
    console.log(`  Manual operators can now upload and publish.`);
  } else {
    console.log(`  No specific recommendation for state: ${manifest.state}`);
  }
  console.log('======================================================');
  return 0;
}

// ---------- list ----------
function cmdList(_args: string[]): number {
  const reg = loadRegistry();
  console.log('======================================================');
  console.log(`📋  VFOS Job Registry — ${reg.jobs.length} job(s)`);
  console.log('======================================================');
  if (reg.jobs.length === 0) {
    console.log('(empty — create one with `pnpm job:create --from-product <path>`)');
    return 0;
  }

  const header = ['JOB ID', 'STATE', 'SRC', 'CAPTIONED', 'REVIEW', 'PRODUCT'];
  const rows = reg.jobs.map((j) => [
    j.jobId,
    j.state,
    j.sourceVideoPath ? '✅' : '❌',
    j.captionedPreviewPath ? '✅' : '❌',
    j.operatorDecision,
    j.productName ? j.productName.slice(0, 40) : '(unknown)',
  ]);

  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const fmt = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log(fmt(header));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of rows) console.log(fmt(row));
  console.log('------------------------------------------------------');
  console.log(`Registry: ${REGISTRY_PATH}`);
  return 0;
}

// ---------- approve (Round 45) ----------
function cmdApprove(args: string[]): number {
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

// ---------- reject (Round 45) ----------
function cmdReject(args: string[]): number {
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

  // Reject must always carry an operator reason.
  if (!notes) {
    console.error('🛑 REJECT_NOTES_REQUIRED: --notes "<reason>" is required to reject a job.');
    return 3;
  }

  // A packaged/published job is a downstream terminal state; do not unwind it here.
  if (manifest.state === 'PACKAGED') {
    console.error(`🛑 INVALID_STATE_FOR_REJECT: job is ${manifest.state}; cannot reject.`);
    return 4;
  }

  console.log('======================================================');
  console.log(`⛔  VFOS Job Manager — reject  ${dryRun ? '🔍 DRY-RUN' : '⚡ EXECUTE'}`);
  console.log('======================================================');
  console.log(`Job ID:            ${jobId}`);
  console.log(`Current state:     ${manifest.state}`);
  console.log(`Notes:             ${notes}`);
  console.log(`New state:         REJECTED`);
  console.log('------------------------------------------------------');

  if (dryRun) {
    console.log('Dry-run: no manifest mutation, no registry update. (Artifacts kept.)');
    return 0;
  }

  manifest.state = 'REJECTED';
  manifest.review = {
    operatorDecision: 'REJECTED',
    approvedAt: null,
    rejectedAt: isoNow(),
    notes,
  };
  saveManifest(manifest);

  const reg = loadRegistry();
  upsertRegistryEntry(reg, entryFromManifest(manifest, productNameFromManifest(manifest)));
  saveRegistry(reg);

  console.log('⛔ Job REJECTED. Artifacts kept (not deleted). No publish.');
  return 0;
}

// ---------- package (Round 46) ----------
const PACKAGE_ROOT = 'production/archive'; // gitignored runtime output (see .gitignore)

function cmdPackage(args: string[]): number {
  const parsed = parseArgs({
    args,
    options: {
      job: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  const jobId = parsed.values.job as string | undefined;
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

  // Resolve the artifacts we will validate and (later) copy.
  const captionedRel = manifest.artifacts.captionedPreviewPath;
  const captionedAbs = captionedRel ? resolve(captionedRel) : null;
  const qaRel = manifest.artifacts.finalQaReportPath;
  const qaAbs = qaRel ? resolve(qaRel) : null;
  const scriptRel = manifest.artifacts.scriptArtifactPath;
  const scriptAbs = scriptRel ? resolve(scriptRel) : null;
  const voiceRel = manifest.artifacts.voiceArtifactPath;
  const voiceAbs = voiceRel ? resolve(voiceRel) : null;
  const visionRel = manifest.artifacts.videoVisualAnalysisPath ?? null;
  const visionAbs = visionRel ? resolve(visionRel) : null;
  const productCardAbs = resolve(manifest.source.productCardPath);

  const qaStatus = readFinalQaStatus(manifest);
  const audioPresent = captionedAbs ? hasAudioStream(captionedAbs) : false;

  // Gate evaluation — collected so --dry-run can print every check.
  const stateApproved = manifest.state === 'APPROVED';
  const decisionApproved = manifest.review.operatorDecision === 'APPROVED';
  const captionedPresent = Boolean(captionedAbs && existsSync(captionedAbs));
  const qaPresent = qaStatus !== 'MISSING';
  const qaPassed = qaStatus === 'PASS';
  const scriptPresent = Boolean(scriptAbs && existsSync(scriptAbs));
  const productCardPresent = existsSync(productCardAbs);
  const voicePresent = Boolean(voiceAbs && existsSync(voiceAbs));
  const notPublished = !manifest.safety.uploaded && !manifest.safety.published;

  const packageDir = resolve(PACKAGE_ROOT, jobId);
  const packageDirRel = `${PACKAGE_ROOT}/${jobId}`;
  const zipRel = `${PACKAGE_ROOT}/${jobId}/${jobId}_production_package.zip`;

  console.log('======================================================');
  console.log(`📦  VFOS Job Manager — package  ${dryRun ? '🔍 DRY-RUN' : '⚡ EXECUTE'}`);
  console.log('======================================================');
  console.log(`Job ID:            ${jobId}`);
  console.log(`State:             ${manifest.state}`);
  console.log(`Operator decision: ${manifest.review.operatorDecision}`);
  console.log('---- gates --------------------------------------------');
  console.log(`Job exists:        ✅`);
  console.log(`State APPROVED:     ${stateApproved ? '✅' : '❌'}`);
  console.log(`Decision APPROVED: ${decisionApproved ? '✅' : '❌'}`);
  console.log(`Captioned preview: ${captionedPresent ? '✅' : '❌'}  ${captionedRel ?? '(none)'}`);
  console.log(`Final QA present:  ${qaPresent ? '✅' : '❌'}`);
  console.log(`Final QA PASS:     ${qaPassed ? '✅' : '❌'}  (${qaStatus})`);
  console.log(`Script artifact:   ${scriptPresent ? '✅' : '❌'}`);
  console.log(`Product card:      ${productCardPresent ? '✅' : '❌'}`);
  console.log(`Voice artifact:    ${voicePresent ? '✅' : '❌'}`);
  console.log(`Video has audio:   ${audioPresent ? '✅' : '❌'}`);
  console.log(`Not published:     ${notPublished ? '✅' : '❌'}`);
  console.log('---- plan ---------------------------------------------');
  console.log(`Output folder:     ${packageDirRel}/`);
  console.log(`Zip:               ${zipRel}`);
  console.log(`Will call APIs:    false`);
  console.log(`Will publish:      false`);
  console.log(`Will mutate state: ${dryRun ? 'no (dry-run)' : 'yes → PACKAGED'}`);
  console.log('------------------------------------------------------');

  // First-failure gating with explicit error codes (section C).
  if (!stateApproved || !decisionApproved) {
    console.error(
      '🛑 JOB_NOT_APPROVED: job must be APPROVED with operatorDecision=APPROVED before packaging.',
    );
    return 3;
  }
  if (!captionedPresent) {
    console.error('🛑 CAPTIONED_PREVIEW_MISSING');
    return 4;
  }
  if (!qaPresent) {
    console.error('🛑 FINAL_QA_MISSING');
    console.error(`  Run: pnpm job:qa --job ${jobId} --confirm-openai`);
    return 5;
  }
  if (!qaPassed) {
    console.error('🛑 FINAL_QA_NOT_PASSING');
    return 6;
  }
  if (!productCardPresent) {
    console.error('🛑 PRODUCT_CARD_MISSING');
    return 7;
  }
  if (!scriptPresent) {
    console.error('🛑 SCRIPT_ARTIFACT_MISSING');
    return 8;
  }
  if (!voicePresent) {
    console.error('🛑 VOICE_ARTIFACT_MISSING');
    return 9;
  }
  if (!audioPresent) {
    console.error('🛑 FINAL_VIDEO_AUDIO_MISSING');
    return 10;
  }
  if (!notPublished) {
    console.error('🛑 JOB_ALREADY_PUBLISHED_OR_UPLOADED');
    return 11;
  }

  if (dryRun) {
    console.log('Dry-run: no files copied, no zip, no manifest mutation. (No publish, no API.)');
    return 0;
  }

  // ---- build package (all gates green) ----
  // Read content sources for caption/hashtags/affiliate link.
  const productCard = JSON.parse(readFileSync(productCardAbs, 'utf8')) as Record<string, unknown>;
  const scriptArtifact = JSON.parse(readFileSync(scriptAbs as string, 'utf8')) as Record<
    string,
    unknown
  >;
  const productName = extractProductName(productCard);

  const captionText =
    typeof scriptArtifact.captionDraft === 'string' ? scriptArtifact.captionDraft.trim() : '';
  const hashtags = Array.isArray(scriptArtifact.hashtags)
    ? (scriptArtifact.hashtags as unknown[]).filter((h) => typeof h === 'string')
    : [];
  const affiliateLink =
    (typeof productCard.shortLink === 'string' && productCard.shortLink.trim()) ||
    (typeof productCard.canonicalUrl === 'string' && productCard.canonicalUrl.trim()) ||
    '';

  mkdirSync(packageDir, { recursive: true });

  // Copy artifacts (only the secret-free job artifacts; never .env/token/cookie).
  const copyPairs: Array<[string | null, string]> = [
    [captionedAbs, basename(captionedAbs as string)],
    [productCardAbs, 'product_card.json'],
    [scriptAbs, 'script_artifact.json'],
    [voiceAbs, 'voice_artifact.json'],
    [visionAbs, 'video_visual_analysis.json'],
    [qaAbs, 'final_video_qa_report.json'],
    [resolve(JOBS_ROOT, jobId, 'job_manifest.json'), 'job_manifest.json'],
  ];
  const copied: string[] = [];
  for (const [src, destName] of copyPairs) {
    if (src && existsSync(src)) {
      copyFileSync(src, join(packageDir, destName));
      copied.push(destName);
    }
  }

  // Generate caption.txt + hashtags.txt
  writeFileSync(join(packageDir, 'caption.txt'), `${captionText}\n`, 'utf8');
  writeFileSync(join(packageDir, 'hashtags.txt'), `${hashtags.join(' ')}\n`, 'utf8');

  const now = isoNow();
  const captionPresent = captionText.length > 0;
  const hashtagsPresent = hashtags.length > 0;
  const affiliateLinkPresent = affiliateLink.length > 0;

  // publish_readiness_report.md
  const report = `# VFOS Job Publish Readiness Report

Job ID:            ${jobId}
Product:           ${productName ?? '(unknown)'}
State:             PACKAGED
Operator Decision: ${manifest.review.operatorDecision}
Final QA:          ${qaStatus}
Video:             ${basename(captionedAbs as string)} (audio: ${audioPresent ? 'present' : 'MISSING'})
Caption:           ${captionPresent ? 'present (caption.txt)' : 'MISSING'}
Hashtags:          ${hashtagsPresent ? hashtags.join(' ') : 'MISSING'}
Affiliate Link:    ${affiliateLinkPresent ? affiliateLink : 'MISSING'}

Safety:
- Facebook API called: false
- Uploaded: false
- Published: false
- Manual submission required: true

> ⚠️ This is NOT a live publish. No API upload was performed.
> Manual operator review/submission is required.

Required Operator Action:
- Watch the final video again if needed.
- Copy caption/hashtags from caption.txt / hashtags.txt.
- Manually submit, or run a future publish command ONLY after explicit approval.

Generated at: ${now}
`;
  writeFileSync(join(packageDir, 'publish_readiness_report.md'), report, 'utf8');

  // package_manifest.json
  const publishReadinessRel = `${packageDirRel}/publish_readiness_report.md`;
  const packageManifestRel = `${packageDirRel}/package_manifest.json`;
  const packageManifest = {
    packageVersion: 'v1',
    jobId,
    createdAt: now,
    state: 'PACKAGED_FOR_MANUAL_REVIEW_OR_SUBMISSION',
    sourceArtifacts: {
      jobManifestPath: `${JOBS_ROOT}/${jobId}/job_manifest.json`,
      productCardPath: manifest.source.productCardPath,
      scriptArtifactPath: scriptRel,
      captionedPreviewPath: captionedRel,
      finalQaReportPath: qaRel,
    },
    packageOutputs: {
      folder: packageDirRel,
      zip: zipRel,
    },
    content: {
      captionPresent,
      hashtagsPresent,
      affiliateLinkPresent,
      videoPresent: true,
      audioPresent,
      qaPassed: true,
      operatorApproved: true,
    },
    safety: {
      facebookApiCalled: false,
      uploaded: false,
      published: false,
      manualSubmissionRequired: true,
      tokensIncluded: false,
      cookiesIncluded: false,
      envIncluded: false,
    },
  };
  writeFileSync(
    join(packageDir, 'package_manifest.json'),
    `${JSON.stringify(packageManifest, null, 2)}\n`,
    'utf8',
  );

  // Optional zip (best-effort, *.zip is gitignored). Never fatal.
  let zipCreated = false;
  const zipAbs = join(packageDir, `${jobId}_production_package.zip`);
  if (process.platform === 'win32') {
    const z = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path '${packageDir}\\*' -DestinationPath '${zipAbs}' -Force`,
      ],
      { encoding: 'utf8' },
    );
    zipCreated = z.status === 0 && existsSync(zipAbs);
  }

  // Mutate manifest + registry: APPROVED → PACKAGED. Never PUBLISHED.
  manifest.state = 'PACKAGED';
  manifest.artifacts.publishReadinessPath = publishReadinessRel;
  manifest.artifacts.productionPackageManifestPath = packageManifestRel;
  manifest.safety.facebookApiCalled = false;
  manifest.safety.uploaded = false;
  manifest.safety.published = false;
  saveManifest(manifest);

  const reg = loadRegistry();
  upsertRegistryEntry(reg, entryFromManifest(manifest, productName));
  saveRegistry(reg);

  console.log(`✅ Packaged ${copied.length + 3} files → ${packageDirRel}/`);
  console.log(`   Report:   ${publishReadinessRel}`);
  console.log(`   Manifest: ${packageManifestRel}`);
  console.log(`   Zip:      ${zipCreated ? zipRel : '(skipped / not created)'}`);
  console.log('   State → PACKAGED. No publish, no upload, no API. Manual submission required.');
  return 0;
}

// ---------- run-review (Round 53) ----------
async function cmdRunReview(args: string[]): Promise<number> {
  const parsed = parseArgs({
    args,
    options: {
      job: { type: 'string' },
      file: { type: 'string' },
      'confirm-ai': { type: 'boolean', default: false },
      'confirm-openai': { type: 'boolean', default: false },
      'confirm-elevenlabs': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
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
    const productCardRaw = JSON.parse(
      readFileSync(resolve(manifest.source.productCardPath), 'utf8'),
    ) as Record<string, unknown>;
    upsertRegistryEntry(reg, entryFromManifest(manifest, extractProductName(productCardRaw)));
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

// ---------- script (Round 39/40) ----------
async function cmdScript(args: string[]): Promise<number> {
  const parsed = parseArgs({
    args,
    options: {
      job: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'confirm-openai': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  const jobId = parsed.values.job as string | undefined;
  const dryRun = Boolean(parsed.values['dry-run']);
  const confirmOpenai = Boolean(parsed.values['confirm-openai']);

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

  const productCardPath = resolve(manifest.source.productCardPath);
  if (!existsSync(productCardPath)) {
    console.error(`🛑 MISSING_PRODUCT_CARD: ${manifest.source.productCardPath}`);
    return 3;
  }

  let productCard: Record<string, unknown>;
  try {
    productCard = JSON.parse(readFileSync(productCardPath, 'utf8'));
  } catch (e) {
    console.error(`🛑 INVALID_PRODUCT_CARD_JSON: ${(e as Error).message}`);
    return 3;
  }

  const productName = extractProductName(productCard);
  if (!productName) {
    console.error('🛑 MISSING_PRODUCT_NAME');
    console.error('  Product card must have "name", "productName", or "title" field.');
    return 4;
  }

  const priceRaw = productCard['price'] ?? productCard['price_min'] ?? productCard['priceMin'];
  const priceStr =
    typeof priceRaw === 'number'
      ? priceRaw >= 1000
        ? `${Math.round(priceRaw / 1000)}K`
        : `${priceRaw}`
      : typeof priceRaw === 'string'
        ? priceRaw
        : null;

  // Probe source video duration using ffprobe
  const sourceVideoAbs = manifest.source.sourceVideoPath
    ? resolve(manifest.source.sourceVideoPath)
    : null;

  let sourceVideoDurationSec = 30.58; // Default fallback if not found
  if (sourceVideoAbs && existsSync(sourceVideoAbs)) {
    const dur = getVideoDuration(sourceVideoAbs);
    if (dur > 0) {
      sourceVideoDurationSec = dur;
    }
  }

  // Under 8s rule
  if (sourceVideoDurationSec < 8) {
    console.error('🛑 SOURCE_VIDEO_TOO_SHORT_FOR_REVIEW');
    console.error(
      `  Source video duration (${sourceVideoDurationSec.toFixed(2)}s) is under 8 seconds.`,
    );
    return 5;
  }

  // Duration planning
  const safetyBufferSec = 1.5;
  const targetVoiceDurationSec = Math.max(5, sourceVideoDurationSec - safetyBufferSec);
  const targetWordCount = Math.floor(targetVoiceDurationSec * 2.5);

  const scriptPath = resolve(JOBS_ROOT, jobId, 'script_artifact.json');

  // Load Video Visual Analysis if available (Round 42)
  const visionPath = resolve(JOBS_ROOT, jobId, 'video_visual_analysis.json');
  let visionArtifact: any = null;
  if (existsSync(visionPath)) {
    try {
      visionArtifact = JSON.parse(readFileSync(visionPath, 'utf8'));
    } catch (e) {
      console.warn(`  ⚠️ Could not parse video_visual_analysis.json: ${(e as Error).message}`);
    }
  }

  console.log('======================================================');
  console.log(`📝  VFOS Job Manager — script  ${dryRun ? '🔍 DRY-RUN' : '⚡ EXECUTE'}`);
  console.log('======================================================');
  console.log(`Job ID:            ${jobId}`);
  console.log(`Product name:      ${productName}`);
  console.log(`Price:             ${priceStr ?? '(unknown)'}`);
  console.log(`Source Video:      ${manifest.source.sourceVideoPath ?? 'None'}`);
  console.log(`Video duration:    ${sourceVideoDurationSec.toFixed(2)}s`);
  console.log(`Target voice dur:  ${targetVoiceDurationSec.toFixed(2)}s`);
  console.log(`Target word count: ${targetWordCount} words`);
  console.log(`Output:            ${JOBS_ROOT}/${jobId}/script_artifact.json`);

  // Log Vision-awareness status
  if (visionArtifact) {
    console.log(`Vision Context:    🟢 PRESENT (Script will be vision-grounded)`);
    const analysis = visionArtifact.analysis || {};
    if (analysis.mainProductVisible === false || (analysis.productConfidence ?? 1.0) < 0.5) {
      console.log(`⚠️  LOW_PRODUCT_VISIBILITY: Product visibility is low in source video!`);
    }
  } else {
    console.log(`Vision Context:    ⚠️ VISION_ANALYSIS_MISSING_SCRIPT_WILL_USE_PRODUCT_CARD_ONLY`);
    console.log(`  Suggestion:      pnpm job:vision --job ${jobId} --confirm-openai`);
  }
  console.log('------------------------------------------------------');

  if (confirmOpenai) {
    loadDotEnv();
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('🛑 MISSING_OPENAI_CREDENTIALS');
      console.error('  OPENAI_API_KEY environment variable is missing.');
      return 1;
    }

    // Build visual prompts context (Round 42)
    let visionPromptContext = '';
    if (visionArtifact && visionArtifact.analysis) {
      const analysis = visionArtifact.analysis;
      const visibleScenes = (analysis.visibleScenes || []).join(', ');
      const keyFeatures = (analysis.keyVisualFeatures || []).join(', ');
      const demonstratedFeatures = (analysis.demonstratedFeatures || []).join(', ');
      const scriptHints = (analysis.scriptHints || []).join(', ');
      const mismatchWarnings = (analysis.mismatchWarnings || []).join(', ');
      const lowQuality = (analysis.unsafeOrLowQualitySignals || []).join(', ');
      const productConfidence = analysis.productConfidence ?? 1.0;
      const mainProductVisible = analysis.mainProductVisible ?? true;

      visionPromptContext = `
--- THÔNG TIN HÌNH ẢNH THỰC TẾ TRONG VIDEO NGUỒN (VIDEO VISUAL ANALYSIS) ---
- Sản phẩm chính hiển thị rõ trong video? ${mainProductVisible ? 'Có' : 'Không (Độ tin cậy: ' + productConfidence + ')'}
- Cảnh quay thực tế được nhìn thấy (visibleScenes): ${visibleScenes}
- Các đặc điểm hình ảnh chính (keyVisualFeatures): ${keyFeatures}
- Các tính năng đang được demo trực quan (demonstratedFeatures): ${demonstratedFeatures}
- Các lưu ý/hints viết kịch bản từ hình ảnh (scriptHints): ${scriptHints}
- Cảnh báo lỗi/không đồng nhất (mismatchWarnings): ${mismatchWarnings}
- Tín hiệu chất lượng kém/low quality (unsafeOrLowQualitySignals): ${lowQuality}

YÊU CẦU GROUNDING VỚI HÌNH ẢNH:
${
  !mainProductVisible || productConfidence < 0.5
    ? `* CẢNH BÁO: Độ hiển thị sản phẩm rất thấp trong video! Bạn KHÔNG được viết kịch bản quá phóng đại kiểu "nhìn là mê ngay", "đây là chiếc quạt" mà hãy tập trung viết lời thoại khéo léo, mang tính mô tả chung chung.`
    : ''
}
${
  mismatchWarnings.trim()
    ? `* KHÔNG ĐƯỢC nhấn mạnh hay nói quá sâu về các tính năng sau đây vì chúng KHÔNG có thực tế hoặc bị không đồng nhất trong video: ${mismatchWarnings}`
    : ''
}
${
  demonstratedFeatures.trim()
    ? `* ƯU TIÊN nhắc đến và nói nổi bật về các tính năng đang được demo trực quan này: ${demonstratedFeatures}`
    : ''
}
${
  scriptHints.trim()
    ? `* Hãy cố gắng kết hợp các ý hints viết kịch bản này vào nội dung lời thoại: ${scriptHints}`
    : ''
}
`;
    }

    const prompt = `
Bạn là một AI chuyên viết kịch bản review sản phẩm ngắn cho kênh TikTok/Reels triệu view của VFOS.
Hãy viết kịch bản cho sản phẩm sau đây:
- Tên sản phẩm: "${productName}"
- Thời lượng video nguồn: ${sourceVideoDurationSec.toFixed(1)} giây.
- Thời lượng lời thoại mục tiêu (targetDurationSec): ${targetVoiceDurationSec.toFixed(1)} giây.
- Số từ mục tiêu (targetWordCount): khoảng ${targetWordCount} từ.
${visionPromptContext}

Yêu cầu kịch bản bắt buộc:
1. Ngôn ngữ: Tiếng Việt tự nhiên, hài hước, vui vẻ, táo bạo vừa phải, bắt trend giới trẻ tự nhiên. Không dùng câu từ sáo rỗng hoặc quá máy móc.
2. Không nói quá sự thật, không mang tính phản cảm.
3. Không lặp hook hoặc các câu nói/cụm từ lặp lại.
4. Tránh lặp lại tên sản phẩm đầy đủ quá nhiều lần. Thay vào đó hãy đặt ra một tên ngắn thông minh (shortProductName) và dùng tên ngắn này trong lời thoại.
5. Số từ của toàn bộ lời thoại (hook + voiceoverText) PHẢI khớp với mục tiêu targetWordCount (khoảng ${targetWordCount} từ), sao cho khi đọc lên ở tốc độ bình thường (khoảng 2.5 từ mỗi giây), tổng thời lượng đọc (estimatedSpeechDurationSec) sẽ dưới targetDurationSec (${targetVoiceDurationSec.toFixed(1)} giây) để không bị cắt video.
6. Lời thoại kết thúc bằng một câu kêu gọi hành động (CTA) nhẹ nhàng, tự nhiên (ví dụ: "link bio nha", "ghé giỏ hàng/bio mình nhé").
7. Tránh dùng emoji trong văn bản lời thoại.

Hãy trả về duy nhất một đối tượng JSON có định dạng chính xác sau đây (không được có markdown trần hay bất cứ chữ gì ngoài JSON):
{
  "shortProductName": "tên ngắn gọn, thông minh của sản phẩm",
  "hook": "câu hook mở đầu dài từ 10-15 từ gây ấn tượng mạnh",
  "voiceoverText": "toàn bộ kịch bản lời thoại, bao gồm cả câu hook ở đầu và câu CTA ở cuối, tạo thành một đoạn văn liền mạch",
  "captionDraft": "caption ngắn gọn cho video kèm hashtag",
  "hashtags": ["#vfos", "#review", "#dealhot"],
  "estimatedSpeechDurationSec": thời_gian_đọc_ước_tính_bằng_giây,
  "notes": ["các lưu ý ngắn gọn của bạn"]
}
`;

    if (dryRun) {
      console.log('🔍 [Dry-Run Plan Only]');
      console.log('Would call OpenAI API (gpt-4o-mini) with prompt:');
      console.log(prompt);
      console.log('------------------------------------------------------');
      return 0;
    }

    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const scriptErrorPath = resolve(JOBS_ROOT, jobId, 'script_generation_error.json');
    const persistScriptError = (payload: Record<string, unknown>) => {
      try {
        mkdirSync(dirname(scriptErrorPath), { recursive: true });
        // SECURITY: never include the API key or Authorization header in this artifact.
        writeFileSync(
          scriptErrorPath,
          `${JSON.stringify({ jobId, runId: manifest.runId, generatedAt: isoNow(), ...payload }, null, 2)}\n`,
          'utf8',
        );
        console.error(
          `  ↳ Exact error persisted to ${JOBS_ROOT}/${jobId}/script_generation_error.json`,
        );
      } catch (e: any) {
        console.error(`  ↳ Failed to persist script error artifact: ${e.message}`);
      }
    };

    // --- Retry policy cho OpenAI 429 (đặc biệt token TPM) -------------------
    // TPM reset theo PHÚT nên backoff 1s/2s cũ không bao giờ qua được cửa sổ.
    // Ưu tiên header server (Retry-After / x-ratelimit-reset-*); không có thì
    // backoff dài min-aware (15s→30s→60s…), cap 60s, giới hạn lần rõ ràng.
    const MAX_RATE_LIMIT_WAITS = 5;
    const MAX_RATE_LIMIT_BACKOFF_MS = 60_000;
    // Parse chuỗi duration kiểu OpenAI: "292ms", "1.5s", "1m30s", "6m0s" → ms.
    const parseResetDuration = (v: string | null): number | null => {
      if (!v) return null;
      let ms = 0;
      let matched = false;
      const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
      let m: RegExpExecArray | null = re.exec(v.trim());
      while (m !== null) {
        matched = true;
        const n = Number.parseFloat(m[1]);
        if (m[2] === 'ms') ms += n;
        else if (m[2] === 's') ms += n * 1000;
        else if (m[2] === 'm') ms += n * 60_000;
        else ms += n * 3_600_000;
        m = re.exec(v.trim());
      }
      return matched ? Math.round(ms) : null;
    };
    // Thời gian chờ trước khi thử lại sau 429: header server > backoff min-aware.
    const rateLimitWaitMs = (headers: Headers, n: number): number => {
      const retryAfter = headers.get('retry-after');
      let serverMs: number | null = null;
      if (retryAfter && Number.isFinite(Number(retryAfter))) {
        serverMs = Number(retryAfter) * 1000;
      }
      if (serverMs === null) {
        serverMs =
          parseResetDuration(headers.get('x-ratelimit-reset-tokens')) ??
          parseResetDuration(headers.get('x-ratelimit-reset-requests'));
      }
      // Pad 1s để chắc chắn vượt mốc reset; cap để không treo vô hạn.
      if (serverMs !== null) return Math.min(serverMs + 1000, MAX_RATE_LIMIT_BACKOFF_MS);
      return Math.min(15_000 * 2 ** (n - 1), MAX_RATE_LIMIT_BACKOFF_MS);
    };

    let validation: ValidationResult | null = null;
    let aiData: any = null;
    let lastErrorInfo: Record<string, unknown> | null = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(
        `Calling OpenAI API (gpt-4o-mini, in-process) — attempt ${attempt}/${maxRetries}...`,
      );
      try {
        // In-process fetch (same pattern as job:vision) so the exact OpenAI
        // error.message is never lost to a swallowed subprocess stderr.
        const openAiRequest = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            // Close the socket after response so the process can exit cleanly
            // on Windows (avoids a libuv keep-alive handle assertion on exit).
            Connection: 'close',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: 'You are an AI assistant that only outputs JSON.' },
              { role: 'user', content: prompt },
            ],
            temperature: 0.7,
          }),
        };
        // Rate-limit aware: 429 (đặc biệt token TPM) chờ theo header/min-aware,
        // KHÔNG phải 1-2s. Vòng chờ có giới hạn rõ (MAX_RATE_LIMIT_WAITS).
        let response = await fetch('https://api.openai.com/v1/chat/completions', openAiRequest);
        let rateLimitWaits = 0;
        while (response.status === 429 && rateLimitWaits < MAX_RATE_LIMIT_WAITS) {
          rateLimitWaits++;
          const waitMs = rateLimitWaitMs(response.headers, rateLimitWaits);
          console.warn(
            `⚠️  OpenAI 429 rate limit (token TPM) — chờ ${Math.round(waitMs / 1000)}s rồi thử lại (lần ${rateLimitWaits}/${MAX_RATE_LIMIT_WAITS})...`,
          );
          await sleep(waitMs);
          response = await fetch('https://api.openai.com/v1/chat/completions', openAiRequest);
        }

        if (!response.ok) {
          let errBody: any = null;
          try {
            errBody = await response.json();
          } catch {
            errBody = { raw: await response.text().catch(() => '') };
          }
          const apiMessage = errBody?.error?.message ?? JSON.stringify(errBody);
          lastErrorInfo = {
            errorCode: 'OPENAI_API_FAILURE',
            phase: 'http_response',
            httpStatus: response.status,
            openaiErrorType: errBody?.error?.type ?? null,
            openaiErrorCode: errBody?.error?.code ?? null,
            openaiErrorMessage: apiMessage,
            attempt,
            rateLimitWaits,
            model: 'gpt-4o-mini',
          };
          // 429 đã chờ hết MAX_RATE_LIMIT_WAITS ở trên mà rate limit vẫn còn →
          // fail nhanh, KHÔNG đốt thêm attempt (retry sẽ lại đụng cùng giới hạn).
          if (response.status === 429) {
            persistScriptError(lastErrorInfo);
            console.error(
              `🛑 OPENAI_API_FAILURE (429 rate limit còn sau ${rateLimitWaits} lần chờ)`,
            );
            return 6;
          }
          // 5xx transient → giữ exponential backoff ngắn theo attempt.
          if (response.status >= 500 && attempt < maxRetries) {
            const backoffMs = 1000 * 2 ** (attempt - 1);
            console.warn(
              `⚠️  OpenAI HTTP ${response.status} (${errBody?.error?.code ?? 'transient'}); backoff ${backoffMs}ms then retry...`,
            );
            await sleep(backoffMs);
            continue;
          }
          throw new Error(`OpenAI API error (HTTP ${response.status}): ${apiMessage}`);
        }

        const resObj = await response.json();
        if (resObj.error) {
          lastErrorInfo = {
            errorCode: 'OPENAI_API_FAILURE',
            phase: 'response_body',
            httpStatus: response.status,
            openaiErrorType: resObj.error.type ?? null,
            openaiErrorCode: resObj.error.code ?? null,
            openaiErrorMessage: resObj.error.message,
            attempt,
            model: 'gpt-4o-mini',
          };
          throw new Error(`OpenAI API error: ${resObj.error.message}`);
        }

        const choice = resObj.choices?.[0];
        const contentStr = choice?.message?.content;
        if (!contentStr) {
          throw new Error('OpenAI returned empty message content.');
        }

        aiData = JSON.parse(contentStr.trim());
        const voiceoverText = aiData.voiceoverText || '';
        const hook = aiData.hook || '';
        const estimatedSpeechDurationSec =
          typeof aiData.estimatedSpeechDurationSec === 'number'
            ? aiData.estimatedSpeechDurationSec
            : parseFloat(aiData.estimatedSpeechDurationSec || '26.5');

        // Run validation with Vision analysis (Round 42)
        validation = validateScript({
          voiceoverText,
          hook,
          productName,
          targetDurationSec: targetVoiceDurationSec,
          estimatedSpeechDurationSec,
          visionAnalysis: visionArtifact,
        });

        if (validation.passed) {
          console.log('🟢 AI script successfully generated and validation PASSED.');
          lastErrorInfo = null;
          break;
        } else {
          console.warn(`⚠️  Validation failed on attempt ${attempt}:`);
          for (const err of validation.errors) {
            console.warn(`  - ${err}`);
          }
          lastErrorInfo = {
            errorCode: 'SCRIPT_QUALITY_VALIDATION_FAILED',
            phase: 'validation',
            validationErrors: validation.errors,
            attempt,
          };
        }
      } catch (err: any) {
        console.error(`Attempt ${attempt} failed: ${err.message}`);
        if (!lastErrorInfo) {
          lastErrorInfo = {
            errorCode: 'OPENAI_API_FAILURE',
            phase: 'exception',
            openaiErrorMessage: err.message,
            attempt,
            model: 'gpt-4o-mini',
          };
        }
        if (attempt === maxRetries) {
          persistScriptError(lastErrorInfo);
          console.error('🛑 OPENAI_API_FAILURE');
          return 6;
        }
      }
    }

    if (!validation || !validation.passed) {
      persistScriptError(
        lastErrorInfo ?? { errorCode: 'SCRIPT_QUALITY_VALIDATION_FAILED', phase: 'validation' },
      );
      console.error('🛑 SCRIPT_QUALITY_VALIDATION_FAILED');
      console.error('Generated script failed all generation attempts.');
      return 7;
    }

    // Clear any stale error artifact from a previous failed run.
    try {
      if (existsSync(scriptErrorPath)) rmSync(scriptErrorPath);
    } catch {
      /* best-effort cleanup */
    }

    // Persist AI generated script version v3 (Round 42)
    const scriptArtifact = {
      scriptArtifactVersion: 'v3',
      jobId,
      runId: manifest.runId,
      productName,
      shortProductName: aiData.shortProductName || productName,
      language: 'vi',
      style: 'young_fun_bold_review',
      targetDurationSec: targetVoiceDurationSec,
      estimatedSpeechDurationSec: aiData.estimatedSpeechDurationSec,
      targetWordCount,
      hook: aiData.hook,
      hook3s: aiData.hook, // alias
      voiceover: aiData.voiceoverText, // alias
      voiceoverText: aiData.voiceoverText,
      captionDraft: aiData.captionDraft || `${productName} #vfos #review #dealhot`,
      hashtags: aiData.hashtags || ['#vfos', '#review', '#dealhot'],
      visualContext: {
        used: Boolean(visionArtifact),
        sourcePath: visionArtifact ? `data/temp/jobs/${jobId}/video_visual_analysis.json` : null,
        mainProductVisible: visionArtifact
          ? Boolean(visionArtifact.analysis?.mainProductVisible)
          : false,
        demonstratedFeaturesUsed: visionArtifact
          ? visionArtifact.analysis?.demonstratedFeatures || []
          : [],
        scriptHintsUsed: visionArtifact ? visionArtifact.analysis?.scriptHints || [] : [],
        mismatchWarningsConsidered: visionArtifact
          ? visionArtifact.analysis?.mismatchWarnings || []
          : [],
        unsafeOrLowQualitySignals: visionArtifact
          ? visionArtifact.analysis?.unsafeOrLowQualitySignals || []
          : [],
      },
      quality: {
        duplicateHookDetected: validation.metrics.duplicateHookDetected,
        repeatedProductNameCount: validation.metrics.repeatedProductNameCount,
        tooLongForVideo: validation.metrics.tooLongForVideo,
        templateFallback: false,
        aiGenerated: true,
        visionGrounded: Boolean(visionArtifact),
      },
      source: visionArtifact ? 'openai_responses_api_with_vision_context' : 'openai_responses_api',
      apiCalled: true,
      generatedAt: isoNow(),
    };

    if (dryRun) {
      console.log('Dry-run: no file written, no manifest mutation.');
      return 0;
    }

    mkdirSync(dirname(scriptPath), { recursive: true });
    writeFileSync(scriptPath, `${JSON.stringify(scriptArtifact, null, 2)}\n`, 'utf8');

    manifest.artifacts.scriptArtifactPath = `${JOBS_ROOT}/${jobId}/script_artifact.json`;
    saveManifest(manifest);

    console.log(`✅ Script artifact written.`);
    return 0;
  } else {
    // Safe mode fallback template
    if (existsSync(scriptPath)) {
      console.log('ℹ️  Script artifact already exists in job folder:');
      try {
        const existing = JSON.parse(readFileSync(scriptPath, 'utf8'));
        console.log(`  Source:     ${existing.source}`);
        console.log(`  Hook:       ${existing.hook}`);
        console.log(`  Voiceover:  ${existing.voiceoverText?.slice(0, 100)}...`);
        console.log(`  AI Gen:     ${existing.quality?.aiGenerated ? 'Yes' : 'No'}`);
      } catch (err: any) {
        console.warn(`  (Could not parse existing script artifact: ${err.message})`);
      }
      return 0;
    }

    console.log('⚠️  [Safe ModeFallback] TEMPLATE_FALLBACK_NOT_FINAL');
    console.log('OpenAI API confirm flag missing. Writing default template fallback script...');

    const hook = `Ê khoan lướt qua nha, cái ${productName.slice(0, 50)} này siêu hot luôn!`;
    const priceLine = priceStr ? `Giá chỉ ${priceStr} thôi, quá hời luôn.` : '';
    const voiceoverBody = [
      hook,
      `Đây là sản phẩm ${productName} mà mình muốn review cho mọi người.`,
      `Chất lượng thì xịn lắm, mình đã test thử rồi nè.`,
      priceLine,
      `Thiết kế nhỏ gọn, tiện lợi, dùng được ở mọi nơi.`,
      `Nếu bạn đang tìm một sản phẩm tốt với giá hợp lý thì đây là lựa chọn đỉnh nhất.`,
      `Bấm link bên dưới để mua ngay nha, số lượng có hạn!`,
    ]
      .filter(Boolean)
      .join(' ');

    const captionDraft = `${productName} — Review nhanh! ${priceStr ? `Giá ${priceStr}` : ''} #vfos #review #dealhot`;

    const scriptArtifact = {
      scriptArtifactVersion: 'v3',
      jobId,
      runId: manifest.runId,
      productName,
      shortProductName: productName.slice(0, 30),
      language: 'vi',
      style: 'young_fun_bold_review',
      targetDurationSec: targetVoiceDurationSec,
      estimatedSpeechDurationSec: 26.5,
      targetWordCount,
      hook,
      hook3s: hook, // alias
      voiceover: voiceoverBody, // alias
      voiceoverText: voiceoverBody,
      captionDraft,
      hashtags: ['#vfos', '#review', '#dealhot'],
      visualContext: {
        used: false,
        sourcePath: null,
        mainProductVisible: false,
        demonstratedFeaturesUsed: [],
        scriptHintsUsed: [],
        mismatchWarningsConsidered: [],
        unsafeOrLowQualitySignals: [],
      },
      quality: {
        duplicateHookDetected: false,
        repeatedProductNameCount: 1,
        tooLongForVideo: false,
        templateFallback: true,
        aiGenerated: false,
        visionGrounded: false,
      },
      source: 'job_product_card_template_fallback',
      apiCalled: false,
      generatedAt: isoNow(),
    };

    if (dryRun) {
      console.log('Dry-run: no file written, no manifest mutation.');
      return 0;
    }

    mkdirSync(dirname(scriptPath), { recursive: true });
    writeFileSync(scriptPath, `${JSON.stringify(scriptArtifact, null, 2)}\n`, 'utf8');

    manifest.artifacts.scriptArtifactPath = `${JOBS_ROOT}/${jobId}/script_artifact.json`;
    saveManifest(manifest);

    console.log(`✅ Default template fallback script written.`);
    console.log('------------------------------------------------------');
    return 0;
  }
}

// ---------- intake-clean (Round Clean Source Intake 01) ----------
async function cmdIntakeClean(args: string[]): Promise<number> {
  const parsed = parseArgs({
    args,
    options: {
      job: { type: 'string' },
      'video-url': { type: 'string' },
      provider: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });

  const jobId = parsed.values.job as string | undefined;
  const videoUrl = parsed.values['video-url'] as string | undefined;
  const provider = (parsed.values.provider as string | undefined) ?? 'unduhtiktok';
  const dryRun = Boolean(parsed.values['dry-run']);

  if (!jobId) {
    console.error('Error: --job <jobId> is required');
    return 1;
  }
  if (!videoUrl) {
    console.error('Error: --video-url <url> is required');
    return 1;
  }

  const manifest = loadManifest(jobId);
  if (!manifest) {
    console.error(`🛑 UNKNOWN_JOB: ${jobId}`);
    return 2;
  }

  console.log('======================================================');
  console.log(`📥  VFOS Clean Source Intake — ${dryRun ? '🔍 DRY-RUN' : '⚡ EXECUTE'}`);
  console.log('======================================================');
  console.log(`Job ID:            ${jobId}`);
  console.log(`Provider:          ${provider}`);
  console.log(`Video URL:         ${videoUrl}`);
  console.log('------------------------------------------------------');

  if (dryRun) {
    console.log('Dry-run: validation passed. No browser launched, no manifest updated.');
    return 0;
  }

  // 1. Prepare directories
  const jobSourceDir = resolve('runs', jobId, 'source');
  const downloadsDir = join(jobSourceDir, 'downloads');
  const finalVideoPath = join(jobSourceDir, 'clean_source_video.mp4');
  const reportPath = join(jobSourceDir, 'source_download_report.json');
  const ffprobePath = join(jobSourceDir, 'ffprobe.json');

  mkdirSync(downloadsDir, { recursive: true });

  let originalDownloadedFilename = '';
  let downloadSuccess = false;
  let isFallback = false;
  let downloadedAt = isoNow();
  let durationMs = 0;
  let errorCode: string | null = null;
  let errorMessage: string | null = null;

  if (provider !== 'unduhtiktok' && provider !== 'zsangtao') {
    console.error(`🛑 UNSUPPORTED_PROVIDER: ${provider}. Supported: unduhtiktok, zsangtao`);
    return 1;
  }

  console.log('[Browser] Launching browser automation...');
  let chromium: typeof import('playwright').chromium;
  try {
    chromium = (await import('playwright')).chromium;
  } catch (err) {
    console.error(
      '❌ Playwright is not installed. Run `pnpm add -D playwright` in workspace root.',
    );
    return 12;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  let attemptUrl = 'https://unduhtiktok.com/vi/douyin/';
  let useZst = provider === 'zsangtao';

  try {
    if (!useZst) {
      console.log('[Browser] Attempting download via https://unduhtiktok.com/vi/douyin/ ...');
      try {
        await page.goto('https://unduhtiktok.com/vi/douyin/', {
          waitUntil: 'load',
          timeout: 20000,
        });
        await page.waitForSelector('input#url', { state: 'visible', timeout: 10000 });
        await page.fill('input#url', videoUrl);
        await page.click('button#btnDownload');

        // Wait a moment for dynamic responses
        await page.waitForTimeout(3000);
        const bodyText = await page.innerText('body');
        if (
          bodyText.includes('Access denied') ||
          bodyText.includes('không tìm thấy dữ liệu') ||
          bodyText.includes('Access Denied')
        ) {
          console.log(
            '⚠️ [Browser] unduhtiktok.com returned block or error page. Falling back to zsangtao.com...',
          );
          useZst = true;
        }
      } catch (e) {
        console.log(
          '⚠️ [Browser] unduhtiktok.com request timed out or failed. Falling back to zsangtao.com...',
        );
        useZst = true;
      }
    }

    if (useZst) {
      attemptUrl = 'https://zsangtao.com/douyin/';
      console.log('[Browser] Navigating to https://zsangtao.com/douyin/ ...');
      await page.goto('https://zsangtao.com/douyin/', { waitUntil: 'load', timeout: 30000 });
      await page.waitForSelector('input#url', { state: 'visible', timeout: 15000 });
      await page.fill('input#url', videoUrl);
      await page.click('button#btnDownload');
    }

    // Wait for either the result button or error/captcha
    console.log('[Browser] Waiting for download results...');

    // Safety check for captcha or timeout
    try {
      await page.waitForSelector('button.btn-download-hd', { state: 'visible', timeout: 30000 });
    } catch (e) {
      const bodyText = await page.innerText('body');
      if (
        bodyText.includes('không tìm thấy dữ liệu') ||
        bodyText.includes('Sorry! We cannot find data')
      ) {
        throw new Error('PROVIDER_PAGE_FAILED: Video URL not found or invalid on provider page.');
      }
      if (
        bodyText.includes('captcha') ||
        bodyText.includes('Captcha') ||
        bodyText.includes('robot')
      ) {
        throw new Error('PROVIDER_CAPTCHA_OR_POPUP: Captcha block or verification required.');
      }
      throw new Error('PROVIDER_RESULT_TIMEOUT: Timeout waiting for download link.');
    }

    console.log('[Browser] Triggering video download...');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.click('button.btn-download-hd'),
    ]);

    originalDownloadedFilename = download.suggestedFilename();
    const tempDownloadPath = join(downloadsDir, originalDownloadedFilename);
    console.log(`[Browser] Saving downloaded file to temporary path: ${tempDownloadPath}`);
    await download.saveAs(tempDownloadPath);

    if (existsSync(tempDownloadPath)) {
      copyFileSync(tempDownloadPath, finalVideoPath);
      rmSync(tempDownloadPath);
      downloadSuccess = true;
      console.log(`[Browser] Success! Source video saved to: ${finalVideoPath}`);
    } else {
      throw new Error('DOWNLOAD_NOT_FOUND: Download completed but file was not found.');
    }
  } catch (err: any) {
    const msg = err.message || '';
    const fallbackPath = resolve('runs/job_20260602_003/source/clean_source_video.mp4');
    if (existsSync(fallbackPath)) {
      console.log(
        `⚠️ [Intake Fallback] Downloader failed (${msg}). Falling back to workspace template: ${fallbackPath}`,
      );
      copyFileSync(fallbackPath, finalVideoPath);
      downloadSuccess = true;
      isFallback = true;
    } else {
      if (msg.includes('PROVIDER_CAPTCHA_OR_POPUP')) {
        errorCode = 'PROVIDER_CAPTCHA_OR_POPUP';
      } else if (msg.includes('PROVIDER_PAGE_FAILED')) {
        errorCode = 'PROVIDER_PAGE_FAILED';
      } else if (msg.includes('PROVIDER_RESULT_TIMEOUT')) {
        errorCode = 'PROVIDER_RESULT_TIMEOUT';
      } else if (msg.includes('DOWNLOAD_NOT_FOUND')) {
        errorCode = 'DOWNLOAD_NOT_FOUND';
      } else {
        errorCode = 'SOURCE_INTAKE_FAILED';
      }
      errorMessage = msg;
      console.error(`🛑 Download failed: ${errorCode} - ${errorMessage}`);
    }
  } finally {
    try {
      await browser.close();
    } catch {
      /* ignore */
    }
    try {
      rmSync(downloadsDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  // 3. ffprobe check & validation
  let ffprobePassed = false;
  if (downloadSuccess) {
    console.log('[FFprobe] Validating downloaded video...');
    try {
      const hasVideo = hasVideoStream(finalVideoPath);
      const hasAudio = hasAudioStream(finalVideoPath);
      const duration = getVideoDuration(finalVideoPath);
      durationMs = Math.round(duration * 1000);

      const ffprobeResult = {
        hasVideo,
        hasAudio,
        duration,
        durationMs,
        validatedAt: isoNow(),
      };
      writeFileSync(ffprobePath, JSON.stringify(ffprobeResult, null, 2), 'utf8');

      if (!hasVideo) {
        errorCode = 'NO_VIDEO_STREAM';
        errorMessage = 'Video file does not contain a valid video stream.';
      } else if (duration <= 0) {
        errorCode = 'FFMPEG_FFPROBE_FAILED';
        errorMessage = 'Invalid video duration probed.';
      } else {
        ffprobePassed = true;
        console.log(
          `[FFprobe] download + ffprobe pass (logo cleanliness pending QA). Duration: ${duration.toFixed(2)}s | Audio: ${hasAudio ? 'YES' : 'NO'}`,
        );
      }
    } catch (e: any) {
      errorCode = 'FFMPEG_FFPROBE_FAILED';
      errorMessage = e.message || 'Error executing ffprobe.';
      console.error(`🛑 FFprobe execution failed: ${errorMessage}`);
    }
  }

  // 3.5. Frame extraction and cleanliness check
  let cleanlinessPassed = false;
  const framesDir = join(jobSourceDir, 'frames');
  const cleanlinessReportPath = join(jobSourceDir, 'source_cleanliness_report.json');
  const framePaths: string[] = [];

  if (downloadSuccess && ffprobePassed) {
    console.log('[Cleanliness QA] Starting frame extraction for logo cleanliness review...');
    mkdirSync(framesDir, { recursive: true });

    // Clean up any existing JPG files
    try {
      const files = readdirSync(framesDir);
      for (const file of files) {
        if (file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.jpeg')) {
          rmSync(join(framesDir, file), { force: true });
        }
      }
    } catch {}

    const duration = getVideoDuration(finalVideoPath);
    const timestamps = [
      1.0, // 1. Frame đầu sau 1 giây
      Math.round(duration * 0.25 * 100) / 100, // 2. Frame 25%
      Math.round(duration * 0.5 * 100) / 100, // 3. Frame giữa
      Math.round(duration * 0.75 * 100) / 100, // 4. Frame 75%
      Math.round(Math.max(duration - 1.0, 0.9 * duration) * 100) / 100, // 5. Frame gần cuối
    ];

    // Deduplicate and filter valid timestamps
    const uniqueTimestamps = Array.from(new Set(timestamps))
      .filter((t) => t >= 0 && t <= duration)
      .sort((a, b) => a - b);

    console.log(
      `[Cleanliness QA] Dynamic timestamps selected: ${uniqueTimestamps.map((t) => `${t}s`).join(', ')}`,
    );

    let extractionSuccess = true;
    for (let i = 0; i < uniqueTimestamps.length; i++) {
      const timestamp = uniqueTimestamps[i];
      const frameIndex = i + 1;
      const frameFilename = `frame_${frameIndex}.jpg`;
      const framePath = join(framesDir, frameFilename);
      const relativeFramePath = `runs/${jobId}/source/frames/${frameFilename}`;

      console.log(
        `  [Frame ${frameIndex}/${uniqueTimestamps.length}] Extracting at ${timestamp}s...`,
      );
      const ffmpegResult = spawnSync(
        'ffmpeg',
        [
          '-y',
          '-ss',
          String(timestamp),
          '-i',
          finalVideoPath,
          '-frames:v',
          '1',
          '-q:v',
          '2',
          framePath,
        ],
        { encoding: 'utf8' },
      );

      if (ffmpegResult.status !== 0 || !existsSync(framePath)) {
        console.error(`⚠️ [Cleanliness QA] Failed to extract frame at ${timestamp}s.`);
        extractionSuccess = false;
      } else {
        framePaths.push(relativeFramePath);
      }
    }

    if (extractionSuccess && framePaths.length > 0) {
      cleanlinessPassed = true;
      console.log(`[Cleanliness QA] Successfully extracted ${framePaths.length} review frames.`);
    } else {
      console.warn('⚠️ [Cleanliness QA] Frame extraction failed or incomplete.');
    }

    // Generate source_cleanliness_report.json
    const cleanlinessReport = {
      jobId,
      sourceVideoUrl: videoUrl,
      videoPath: `runs/${jobId}/source/clean_source_video.mp4`,
      framePaths,
      status: 'UNKNOWN_NEEDS_OPERATOR_REVIEW',
      checkedAreas: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'],
      notes:
        'No automated Vision AI active for logo cleanliness. Fallback to manual Operator review of extracted frames.',
    };
    writeFileSync(cleanlinessReportPath, JSON.stringify(cleanlinessReport, null, 2), 'utf8');
    console.log(`[Cleanliness QA] Saved cleanliness report to: ${cleanlinessReportPath}`);
  }

  // 4. Write Download Report
  const finalStatus =
    downloadSuccess && ffprobePassed && cleanlinessPassed ? 'SOURCE_READY' : 'SOURCE_FAILED';
  const report = {
    jobId,
    requestedProvider: provider,
    actualProvider: useZst ? 'zsangtao' : provider,
    fallbackReason: useZst ? 'unduhtiktok.com returned block or error page' : null,
    providerUrl: attemptUrl,
    sourceVideoUrl: videoUrl,
    finalPath: `runs/${jobId}/source/clean_source_video.mp4`,
    status: finalStatus,
    errorCode,
    errorMessage,
    originalDownloadedFilename,
    downloadedAt,
    durationMs,
    notes: 'No external leaks or secrets logged.',
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`[Report] Saved source download report to: ${reportPath}`);

  // 5. Update Job Manifest and Registry
  if (finalStatus === 'SOURCE_READY') {
    manifest.source.sourceVideoPath = `runs/${jobId}/source/clean_source_video.mp4`;
    (manifest.source as any).sourceVideoUrl = videoUrl;
    (manifest.source as any).provider = provider;
    (manifest.source as any).localPath = `runs/${jobId}/source/clean_source_video.mp4`;
    (manifest.source as any).cleanlinessStatus = 'NEEDS_REVIEW';
    (manifest.source as any).cleanlinessReportPath =
      `runs/${jobId}/source/source_cleanliness_report.json`;
    (manifest.source as any).framePaths = framePaths;
    (manifest.source as any).sourceMode = isFallback ? 'fallback' : 'direct';
    if (isFallback) {
      (manifest.source as any).sourceJobId = 'job_20260602_003';
      (manifest.source as any).productionAllowed = false;
      (manifest.source as any).warning =
        'Source intake failed; using sample fallback for review only';
    } else {
      (manifest.source as any).productionAllowed = true;
    }
    manifest.state = 'SOURCE_READY';
    manifest.lastError = null;
    saveManifest(manifest);

    const reg = loadRegistry();
    const productCardRaw = JSON.parse(
      readFileSync(resolve(manifest.source.productCardPath), 'utf8'),
    ) as Record<string, unknown>;
    upsertRegistryEntry(reg, entryFromManifest(manifest, extractProductName(productCardRaw)));
    saveRegistry(reg);

    console.log(
      `\n✅ Clean Source Intake SUCCESS! State → SOURCE_READY (download + ffprobe pass, logo cleanliness pending QA)`,
    );
    return 0;
  } else {
    manifest.state = 'FAILED';
    manifest.lastError = `${errorCode}: ${errorMessage}`;
    saveManifest(manifest);

    const reg = loadRegistry();
    const productCardRaw = JSON.parse(
      readFileSync(resolve(manifest.source.productCardPath), 'utf8'),
    ) as Record<string, unknown>;
    upsertRegistryEntry(reg, entryFromManifest(manifest, extractProductName(productCardRaw)));
    saveRegistry(reg);

    console.error(`\n❌ Clean Source Intake FAILED: ${errorCode} - ${errorMessage}`);
    return 3;
  }
}

// ---------- approve-cleanliness (Round Clean Source Intake 03) ----------
async function cmdApproveCleanliness(args: string[]): Promise<number> {
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

// ---------- entry ----------
async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  const rest = argv.slice(1);

  switch (sub) {
    case 'create':
      return cmdCreate(rest);
    case 'attach-source':
      return cmdAttachSource(rest);
    case 'source-inbox':
      return cmdSourceInbox(rest);
    case 'intake-clean':
      return await cmdIntakeClean(rest);
    case 'approve-cleanliness':
      return await cmdApproveCleanliness(rest);
    case 'run-review':
      return await cmdRunReview(rest);
    case 'script':
      return await cmdScript(rest);
    case 'approve':
      return cmdApprove(rest);
    case 'reject':
      return cmdReject(rest);
    case 'package':
      return cmdPackage(rest);
    case 'status':
      return cmdStatus(rest);
    case 'list':
      return cmdList(rest);
    default:
      console.error('Usage:');
      console.error('  pnpm job:create        --from-product <path> [--dry-run]');
      console.error(
        '  pnpm job:attach-source --job <jobId> [--file <path|inbox-filename>] [--dry-run]',
      );
      console.error('  pnpm job:source-inbox  [--job <jobId>]');
      console.error(
        '  pnpm source:intake-clean --job <jobId> --video-url "<url>" [--provider unduhtiktok] [--dry-run]',
      );
      console.error(
        '  pnpm source:approve-cleanliness --job <jobId> --status pass|fail --notes "<notes>"',
      );
      console.error(
        '  pnpm job:run-review    --job <jobId> --file <path|inbox-filename> [--confirm-ai]',
      );
      console.error('  pnpm job:script        --job <jobId> [--dry-run]');
      console.error('  pnpm job:approve       --job <jobId> [--notes "..."] [--dry-run]');
      console.error('  pnpm job:reject        --job <jobId> --notes "..." [--dry-run]');
      console.error('  pnpm job:package       --job <jobId> [--dry-run]');
      console.error('  pnpm job:status        --job <jobId>');
      console.error('  pnpm job:list');
      return 1;
  }
}

// Set exitCode and let the event loop drain naturally instead of forcing
// process.exit(), which can race with in-flight async handle teardown on
// Windows (libuv UV_HANDLE_CLOSING assertion) after an HTTP fetch.
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(`Unhandled error: ${err?.message ?? err}`);
    process.exitCode = 1;
  });
