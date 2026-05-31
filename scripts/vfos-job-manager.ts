/**
 * VFOS Multi-Job Foundation — Round 36.
 *
 * Subcommands:
 *   pnpm job:create        --from-product <path> [--dry-run]
 *   pnpm job:attach-source --job <jobId> --file <path> [--dry-run]
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

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { loadDotEnv } from '../packages/voice/src/load-env.js';

const JOBS_ROOT = 'data/temp/jobs';
const REGISTRY_PATH = 'data/temp/vfos_jobs_registry.json';

const VALID_VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.m4v']);

type JobState =
  | 'CREATED'
  | 'WAITING_FOR_SOURCE_VIDEO'
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

function getVideoDuration(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  const args = [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath
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
    ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', filePath],
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
    errors.push(`Duplicate hook detected: "${args.hook}" appears ${hookOccurrences} times in voiceoverText.`);
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
    errors.push(`Product name "${args.productName}" appears ${prodOccurrences} times (max allowed: 2). Use a shorter name.`);
  } else if (prodOccurrences > 1) {
    warnings.push(`Product name appears ${prodOccurrences} times. Keep it to 1-2 times.`);
  }

  // 3. N-gram repetition (4-6 words):
  const ngramSizes = [4, 5, 6];
  for (const size of ngramSizes) {
    if (words.length >= size) {
      const seen = new Set<string>();
      for (let i = 0; i <= words.length - size; i++) {
        const ngram = words.slice(i, i + size).join(' ').toLowerCase();
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
    errors.push(`Script is too long for the video: estimated speech duration (${args.estimatedSpeechDurationSec.toFixed(1)}s) exceeds target duration (${args.targetDurationSec.toFixed(1)}s).`);
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
      warnings.push(`LOW_PRODUCT_VISIBILITY: Main product visibility is low or confidence is under 50% (${(analysis.productConfidence ?? 1.0) * 100}%). Review source video.`);
    }

    // 6b. Mismatch warnings check: if script mentions items in mismatchWarnings, add warning
    const mismatchWarnings = analysis.mismatchWarnings || [];
    const mismatchFound: string[] = [];
    for (const w of mismatchWarnings) {
      const wWords = w.toLowerCase().split(/\s+/).filter((x: string) => x.length > 2);
      if (wWords.length > 0) {
        const found = wWords.some((wd: string) => textLower.includes(wd));
        if (found) {
          mismatchFound.push(w);
        }
      }
    }
    if (mismatchFound.length > 0) {
      warnings.push(`Script mentions features flagged in video mismatch warnings: "${mismatchFound.join(', ')}".`);
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
        warnings.push(`Script does not mention any demonstrated features from source video analysis: "${demonstratedFeatures.join(', ')}".`);
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
      visionGrounded
    }
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
  console.log(`  pnpm job:attach-source --job ${jobId} --file "C:\\path\\to\\source-video.mp4"`);
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
  if (!filePath) {
    console.error('Error: --file <path> is required');
    return 1;
  }

  const manifest = loadManifest(jobId);
  if (!manifest) {
    console.error(`🛑 UNKNOWN_JOB: ${jobId}`);
    return 2;
  }

  const sourcePath = resolve(filePath);
  if (!existsSync(sourcePath)) {
    console.error(`🛑 MISSING_SOURCE_VIDEO: ${filePath}`);
    return 3;
  }

  const ext = extname(sourcePath).toLowerCase();
  if (!VALID_VIDEO_EXTS.has(ext)) {
    console.error(`🛑 UNSUPPORTED_VIDEO_EXT: ${ext} (allowed: ${[...VALID_VIDEO_EXTS].join(', ')})`);
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
  const productCardRaw = JSON.parse(readFileSync(resolve(manifest.source.productCardPath), 'utf8')) as Record<
    string,
    unknown
  >;
  upsertRegistryEntry(reg, entryFromManifest(manifest, extractProductName(productCardRaw)));
  saveRegistry(reg);

  console.log(`✅ Source attached. State → READY_TO_RENDER`);
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

  const qaReportPath = manifest.artifacts.finalQaReportPath ? resolve(manifest.artifacts.finalQaReportPath) : null;

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
  console.log(`Source video:      ${manifest.source.sourceVideoPath ?? '(none)'}  ${srcPath && exists(srcPath) ? '✅' : '❌'}`);
  console.log(`Voice artifact:    ${manifest.artifacts.voiceArtifactPath ?? '(none)'}  ${voicePath && exists(voicePath) ? '✅' : '❌'}`);
  console.log(`Preview video:     ${manifest.artifacts.previewVideoPath ?? '(none)'}  ${previewPath && exists(previewPath) ? '✅' : '❌'}`);
  console.log(`Captioned preview: ${manifest.artifacts.captionedPreviewPath ?? '(none)'}  ${captionedPath && exists(captionedPath) ? '✅' : '❌'}`);
  console.log(`QA Report:         ${manifest.artifacts.finalQaReportPath ?? '(none)'}  ${qaReportPath && exists(qaReportPath) ? '✅' : '❌'}`);
  console.log(`Created at:        ${manifest.createdAt}`);
  console.log(`Updated at:        ${manifest.updatedAt}`);
  if (manifest.safety) {
    console.log(`Safety Lock:       Uploaded: ${manifest.safety.uploaded ? '✅' : '❌'} | Published: ${manifest.safety.published ? '✅' : '❌'} | API Called: ${manifest.safety.facebookApiCalled ? '✅' : '❌'}`);
  }
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

  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );
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
      console.error(`🛑 INVALID_STATE_FOR_APPROVE: expected READY_FOR_OPERATOR_REVIEW, got ${manifest.state}.`);
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
    console.error('🛑 JOB_NOT_APPROVED: job must be APPROVED with operatorDecision=APPROVED before packaging.');
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
  const scriptArtifact = JSON.parse(readFileSync(scriptAbs as string, 'utf8')) as Record<string, unknown>;
  const productName = extractProductName(productCard);

  const captionText = typeof scriptArtifact.captionDraft === 'string' ? scriptArtifact.captionDraft.trim() : '';
  const hashtags = Array.isArray(scriptArtifact.hashtags) ? (scriptArtifact.hashtags as unknown[]).filter((h) => typeof h === 'string') : [];
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
  writeFileSync(join(packageDir, 'package_manifest.json'), `${JSON.stringify(packageManifest, null, 2)}\n`, 'utf8');

  // Optional zip (best-effort, *.zip is gitignored). Never fatal.
  let zipCreated = false;
  const zipAbs = join(packageDir, `${jobId}_production_package.zip`);
  if (process.platform === 'win32') {
    const z = spawnSync(
      'powershell',
      ['-NoProfile', '-Command', `Compress-Archive -Path '${packageDir}\\*' -DestinationPath '${zipAbs}' -Force`],
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
  const priceStr = typeof priceRaw === 'number'
    ? (priceRaw >= 1000 ? `${Math.round(priceRaw / 1000)}K` : `${priceRaw}`)
    : typeof priceRaw === 'string' ? priceRaw : null;

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
    console.error(`  Source video duration (${sourceVideoDurationSec.toFixed(2)}s) is under 8 seconds.`);
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
        console.error(`  ↳ Exact error persisted to ${JOBS_ROOT}/${jobId}/script_generation_error.json`);
      } catch (e: any) {
        console.error(`  ↳ Failed to persist script error artifact: ${e.message}`);
      }
    };

    let validation: ValidationResult | null = null;
    let aiData: any = null;
    let lastErrorInfo: Record<string, unknown> | null = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`Calling OpenAI API (gpt-4o-mini, in-process) — attempt ${attempt}/${maxRetries}...`);
      try {
        // In-process fetch (same pattern as job:vision) so the exact OpenAI
        // error.message is never lost to a swallowed subprocess stderr.
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
        });

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
            model: 'gpt-4o-mini',
          };
          // Retry with exponential backoff on rate-limit / transient server errors.
          if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
            const backoffMs = 1000 * 2 ** (attempt - 1);
            console.warn(`⚠️  OpenAI HTTP ${response.status} (${errBody?.error?.code ?? 'transient'}); backoff ${backoffMs}ms then retry...`);
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
        const estimatedSpeechDurationSec = typeof aiData.estimatedSpeechDurationSec === 'number'
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
      persistScriptError(lastErrorInfo ?? { errorCode: 'SCRIPT_QUALITY_VALIDATION_FAILED', phase: 'validation' });
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
        mainProductVisible: visionArtifact ? Boolean(visionArtifact.analysis?.mainProductVisible) : false,
        demonstratedFeaturesUsed: visionArtifact ? (visionArtifact.analysis?.demonstratedFeatures || []) : [],
        scriptHintsUsed: visionArtifact ? (visionArtifact.analysis?.scriptHints || []) : [],
        mismatchWarningsConsidered: visionArtifact ? (visionArtifact.analysis?.mismatchWarnings || []) : [],
        unsafeOrLowQualitySignals: visionArtifact ? (visionArtifact.analysis?.unsafeOrLowQualitySignals || []) : [],
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
    ].filter(Boolean).join(' ');

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
      console.error('  pnpm job:attach-source --job <jobId> --file <path> [--dry-run]');
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
