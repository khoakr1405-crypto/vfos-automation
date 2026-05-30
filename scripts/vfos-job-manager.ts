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

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

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

  console.log('======================================================');
  console.log(`🧾  VFOS Job Status — ${jobId}`);
  console.log('======================================================');
  console.log(`Run ID:            ${manifest.runId}`);
  console.log(`Product:           ${productName ?? '(unknown)'}`);
  console.log(`Product ID:        ${manifest.productId ?? '(unknown)'}`);
  console.log(`State:             ${manifest.state}`);
  console.log(`Operator decision: ${manifest.review.operatorDecision}`);
  console.log('------------------------------------------------------');
  console.log(`Source video:      ${manifest.source.sourceVideoPath ?? '(none)'}  ${srcPath && exists(srcPath) ? '✅' : '❌'}`);
  console.log(`Voice artifact:    ${manifest.artifacts.voiceArtifactPath ?? '(none)'}  ${voicePath && exists(voicePath) ? '✅' : '❌'}`);
  console.log(`Preview video:     ${manifest.artifacts.previewVideoPath ?? '(none)'}  ${previewPath && exists(previewPath) ? '✅' : '❌'}`);
  console.log(`Captioned preview: ${manifest.artifacts.captionedPreviewPath ?? '(none)'}  ${captionedPath && exists(captionedPath) ? '✅' : '❌'}`);
  console.log(`Created at:        ${manifest.createdAt}`);
  console.log(`Updated at:        ${manifest.updatedAt}`);
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

// ---------- entry ----------
function main(): number {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  const rest = argv.slice(1);

  switch (sub) {
    case 'create':
      return cmdCreate(rest);
    case 'attach-source':
      return cmdAttachSource(rest);
    case 'status':
      return cmdStatus(rest);
    case 'list':
      return cmdList(rest);
    default:
      console.error('Usage:');
      console.error('  pnpm job:create        --from-product <path> [--dry-run]');
      console.error('  pnpm job:attach-source --job <jobId> --file <path> [--dry-run]');
      console.error('  pnpm job:status        --job <jobId>');
      console.error('  pnpm job:list');
      return 1;
  }
}

process.exit(main());
