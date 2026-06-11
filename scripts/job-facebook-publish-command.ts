/**
 * VFOS Job-Local Facebook Publish Command — Round 48.
 *
 * Command usage:
 *   pnpm job:publish-facebook --job <jobId> --dry-run
 *   pnpm job:publish-facebook --job <jobId> --confirm-live-publish
 *   pnpm job:publish-facebook --job <jobId> --refresh-facebook-preflight
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { parseArgs } from 'node:util';
import { spawnSync, execSync } from 'node:child_process';
import { loadDotEnv } from '../packages/voice/src/load-env.js';
import { createMetaClient, maskToken } from '../packages/facebook/src/meta-client.js';
import { testPageConnection } from '../packages/facebook/src/test-page.js';
import { syncManifestArtifacts } from './job-manifest-helper.js';

// Configuration
const JOBS_ROOT = 'data/temp/jobs';
const PACKAGE_ROOT = 'production/archive';
const REGISTRY_PATH = 'data/temp/vfos_jobs_registry.json';

// Smart exit handler for Windows libuv race conditions
const originalExit = process.exit;
process.exit = ((code?: number) => {
  setTimeout(() => {
    originalExit(code);
  }, 200);
}) as any;

// ── Types ──────────────────────────────────────────────────────────────────

type JobState =
  | 'CREATED'
  | 'WAITING_FOR_SOURCE_VIDEO'
  | 'READY_TO_RENDER'
  | 'RENDERING'
  | 'READY_FOR_OPERATOR_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'PACKAGED'
  | 'PUBLISHED'
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
    facebookApiCalled: boolean;
    uploaded: boolean;
    published: boolean;
    requiresOperatorReview?: boolean;
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

// ── Helper functions ────────────────────────────────────────────────────────

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

function updateRegistryFromManifest(manifest: JobManifest): void {
  const reg = loadRegistry();
  const entryIdx = reg.jobs.findIndex((j) => j.jobId === manifest.jobId);

  let productName: string | null = null;
  const cardPath = resolve(manifest.source.productCardPath);
  if (existsSync(cardPath)) {
    try {
      const card = JSON.parse(readFileSync(cardPath, 'utf8')) as Record<string, unknown>;
      productName = (card.name || card.productName || card.title || '') as string;
    } catch {}
  }

  const entry: RegistryEntry = {
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

  if (entryIdx >= 0) {
    reg.jobs[entryIdx] = entry;
  } else {
    reg.jobs.push(entry);
  }
  saveRegistry(reg);
}

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

// Staged file classification for safety preflights
type PathKind = 'source' | 'secret' | 'runtime' | 'media' | 'other';
const MEDIA_EXTS = ['.mp4', '.mp3', '.wav', '.m4a', '.mov', '.webm'];
const RUNTIME_BASE_PREFIXES = [
  'vfos_daily_status',
  'vfos_daily_runbook',
  'vfos_operator_checkpoint',
  'vfos_git_sync_status',
  'facebook_publish_status',
  'facebook_publish_report',
  'operator_review_pack',
];

function classifyPath(rawPath: string): PathKind {
  const lower = rawPath.toLowerCase().replace(/\\/g, '/');
  const basename = lower.split('/').pop() ?? '';

  if (basename === '.env' || basename.startsWith('.env.')) return 'secret';
  if (lower.startsWith('.secrets/') || lower.includes('/.secrets/')) return 'secret';
  if (lower.endsWith('.har')) return 'secret';
  if (lower.includes('storage_state') || lower.includes('.storage_state.')) return 'secret';
  if (
    basename.endsWith('.json') &&
    /(?:^|[._-])(?:cookies?|session|tokens?|credentials?)(?:[._-]|\.json$)/.test(basename)
  )
    return 'secret';
  if (
    basename.endsWith('.txt') &&
    /(?:^|[._-])(?:cookies?|tokens?|credentials?)(?:[._-]|\.txt$)/.test(basename)
  )
    return 'secret';

  if (MEDIA_EXTS.some((e) => lower.endsWith(e))) return 'media';

  if (lower.startsWith('data/temp/') || lower.includes('/data/temp/')) return 'runtime';
  if (lower.startsWith('production/archive/')) return 'runtime';
  if (RUNTIME_BASE_PREFIXES.some((p) => basename.startsWith(p))) return 'runtime';

  if (
    lower.startsWith('packages/') ||
    lower.startsWith('scripts/') ||
    lower.startsWith('apps/') ||
    lower.startsWith('plugins/') ||
    lower.startsWith('docs/')
  )
    return 'source';
  if (!lower.includes('/')) return 'source';

  return 'other';
}

function checkGitStagedRisks(): { stagedSensitive: boolean; stagedRuntime: boolean } {
  let stagedSensitive = false;
  let stagedRuntime = false;
  try {
    const statusOutput = execSync('git status --porcelain', {
      stdio: 'pipe',
      encoding: 'utf8',
    }).trim();
    if (statusOutput) {
      const lines = statusOutput.split('\n').filter((l) => l.length >= 3);
      for (const line of lines) {
        const indexStatus = line[0];
        const isStaged = indexStatus !== ' ' && indexStatus !== '?';
        if (isStaged) {
          const filePath = line.slice(3).replace(/\s+$/, '');
          const kind = classifyPath(filePath);
          if (kind === 'secret') stagedSensitive = true;
          if (kind === 'runtime' || kind === 'media') stagedRuntime = true;
        }
      }
    }
  } catch {}
  return { stagedSensitive, stagedRuntime };
}

// ── Main CLI Flow ───────────────────────────────────────────────────────────

async function main() {
  // Parse command line arguments
  let values: any;
  try {
    const parsed = parseArgs({
      options: {
        job: { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
        'confirm-live-publish': { type: 'boolean', default: false },
        'refresh-facebook-preflight': { type: 'boolean', default: false },
      },
      allowPositionals: false,
      strict: true,
    });
    values = parsed.values;
  } catch (err: any) {
    console.error(`ERROR: Failed to parse arguments: ${err.message}`);
    process.exit(1);
    return;
  }

  const jobId = values.job;
  const dryRun = Boolean(values['dry-run']);
  const confirmLivePublish = Boolean(values['confirm-live-publish']);
  const refreshPreflight = Boolean(values['refresh-facebook-preflight']);

  if (!jobId) {
    console.error('Error: --job <jobId> is required');
    process.exit(1);
    return;
  }

  console.log('======================================================');
  console.log('📢  VFOS Job-Local Facebook Publishing Validator');
  console.log('======================================================');
  console.log(`Job ID:      ${jobId}`);
  console.log(`Dry Run:     ${dryRun ? '✅ YES' : '❌ NO'}`);
  console.log(`Live Mode:   ${confirmLivePublish ? '⚡ LIVE' : '🔍 READ-ONLY'}`);
  console.log(`Preflight:   ${refreshPreflight ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log('------------------------------------------------------');

  // Load DotEnv
  loadDotEnv();

  // 1. Job exists check
  const manifest = loadManifest(jobId);
  if (!manifest) {
    console.error(`🛑 UNKNOWN_JOB: Job directory or manifest missing for ${jobId}`);
    process.exit(2);
    return;
  }

  // 2. State PACKAGED check
  if (manifest.state !== 'PACKAGED' && manifest.state !== 'PUBLISHED') {
    console.error(`🛑 JOB_NOT_PACKAGED: Job state must be PACKAGED (current: ${manifest.state})`);
    process.exit(3);
    return;
  }

  // 3. Review decision APPROVED check
  if (manifest.review?.operatorDecision !== 'APPROVED') {
    console.error(
      `🛑 JOB_NOT_APPROVED: Operator decision is not APPROVED (current: ${manifest.review?.operatorDecision || 'none'})`,
    );
    process.exit(4);
    return;
  }

  // 4. Final QA report exists check
  const qaRel = manifest.artifacts.finalQaReportPath;
  const qaAbs = qaRel ? resolve(qaRel) : null;
  const qaReportPresent = Boolean(qaAbs && existsSync(qaAbs));
  if (!qaReportPresent) {
    console.error('🛑 FINAL_QA_MISSING: final_video_qa_report.json is missing.');
    process.exit(5);
    return;
  }

  // 5. Final QA status PASS check
  const qaStatus = readFinalQaStatus(manifest);
  if (qaStatus !== 'PASS') {
    console.error(
      `🛑 FINAL_QA_NOT_PASSING: final QA report status is not PASS (status: ${qaStatus})`,
    );
    process.exit(6);
    return;
  }

  // 6. Package manifest exists check
  const packageManifestRel = manifest.artifacts.productionPackageManifestPath;
  const packageManifestAbs = packageManifestRel ? resolve(packageManifestRel) : null;
  const packageManifestPresent = Boolean(packageManifestAbs && existsSync(packageManifestAbs));
  if (!packageManifestPresent) {
    console.error('🛑 PACKAGE_MANIFEST_MISSING: package_manifest.json is missing.');
    process.exit(7);
    return;
  }

  // 7. Captioned preview exists check
  const captionedRel = manifest.artifacts.captionedPreviewPath;
  const captionedAbs = captionedRel ? resolve(captionedRel) : null;
  const captionedPresent = Boolean(captionedAbs && existsSync(captionedAbs));
  if (!captionedPresent) {
    console.error('🛑 CAPTIONED_PREVIEW_MISSING: captioned preview video is missing.');
    process.exit(8);
    return;
  }

  // 8. Video final has audio check
  const audioPresent = captionedAbs ? hasAudioStream(captionedAbs) : false;
  if (!audioPresent) {
    console.error('🛑 FINAL_VIDEO_AUDIO_MISSING: final video does not contain an audio stream.');
    process.exit(9);
    return;
  }

  // 9. Product card has affiliate link check
  const productCardPath = resolve(manifest.source.productCardPath);
  let affiliateLink = '';
  if (existsSync(productCardPath)) {
    try {
      const productCard = JSON.parse(readFileSync(productCardPath, 'utf8'));
      affiliateLink = (productCard.shortLink || productCard.canonicalUrl || '').trim();
    } catch {}
  }
  if (!affiliateLink) {
    console.error(
      '🛑 AFFILIATE_LINK_MISSING: Short link / affiliate link is missing in product card.',
    );
    process.exit(10);
    return;
  }

  // 10. Publish readiness report exists check
  const publishReadinessRel = manifest.artifacts.publishReadinessPath;
  const publishReadinessAbs = publishReadinessRel ? resolve(publishReadinessRel) : null;
  const publishReadinessPresent = Boolean(publishReadinessAbs && existsSync(publishReadinessAbs));
  if (!publishReadinessPresent) {
    console.error('🛑 PUBLISH_READINESS_MISSING: publish_readiness_report.md is missing.');
    process.exit(11);
    return;
  }

  // 11. Safety lock check
  if (manifest.safety?.uploaded === true || manifest.safety?.published === true) {
    console.error(
      '🛑 JOB_ALREADY_UPLOADED_OR_PUBLISHED: Safety lock blocks publish. Job already posted.',
    );
    process.exit(12);
    return;
  }

  // Credentials reading & masking
  const pageId = (process.env.FACEBOOK_PAGE_ID || '').trim();
  const pageAccessToken = (process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '').trim();
  const maskedPageId = pageId ? maskToken(pageId) : 'MISSING';
  const maskedToken = pageAccessToken ? maskToken(pageAccessToken) : 'MISSING';

  // 12. Facebook credentials check (live mode only)
  if (confirmLivePublish && (!pageId || !pageAccessToken)) {
    console.error(
      '🛑 MISSING_FACEBOOK_CREDENTIALS: FACEBOOK_PAGE_ID or FACEBOOK_PAGE_ACCESS_TOKEN is missing in env.',
    );
    process.exit(13);
    return;
  }

  // 13. Staged git risks check (live mode only)
  const stagedRisks = checkGitStagedRisks();
  if (confirmLivePublish && (stagedRisks.stagedSensitive || stagedRisks.stagedRuntime)) {
    console.error(
      '🛑 STAGED_RISKS_DETECTED: Staged sensitive/runtime files are present. Push blocked.',
    );
    if (stagedRisks.stagedSensitive)
      console.error('  -> Secret files/configurations are currently staged.');
    if (stagedRisks.stagedRuntime)
      console.error('  -> Staged runtime reports or media artifacts found.');
    process.exit(14);
    return;
  }

  console.log('✅ ALL PREFLIGHT GATES PASSED.');
  console.log('------------------------------------------------------');

  // Load content package parameters
  let captionText = 'Review siêu phẩm gia dụng!';
  let hashtags: string[] = [];
  try {
    const packageDir = join(PACKAGE_ROOT, jobId);
    const captionFile = join(packageDir, 'caption.txt');
    const hashtagsFile = join(packageDir, 'hashtags.txt');
    if (existsSync(captionFile)) captionText = readFileSync(captionFile, 'utf8').trim();
    if (existsSync(hashtagsFile))
      hashtags = readFileSync(hashtagsFile, 'utf8').trim().split(/\s+/).filter(Boolean);
  } catch {}

  // Mode Selection
  let effectiveMode: 'DRY_RUN' | 'PREFLIGHT' | 'LIVE' = 'DRY_RUN';
  if (confirmLivePublish) effectiveMode = 'LIVE';
  else if (refreshPreflight) effectiveMode = 'PREFLIGHT';

  // ---- DRY-RUN PLAN ----
  if (dryRun || effectiveMode === 'DRY_RUN') {
    console.log('---- PLAN --------------------------------------------');
    console.log(`Page Target ID:   ${maskedPageId}`);
    console.log(`Video File:       ${captionedRel}`);
    console.log(`QA Status:        ${qaStatus}`);
    console.log(`Affiliate Link:   ${affiliateLink}`);
    console.log(`Caption:          ${captionText}`);
    console.log(`Hashtags:         ${hashtags.join(' ')}`);
    console.log(`API Called:       No (dry-run mode)`);
    console.log(`Upload/Publish:   No (dry-run mode)`);
    console.log('------------------------------------------------------');
    console.log('DRY-RUN plan complete. No mutations or API calls performed.');
    process.exit(0);
    return;
  }

  // ---- PREFLIGHT CREDENTIALS MODE ----
  if (effectiveMode === 'PREFLIGHT') {
    console.log('🔒 CREDENTIALS CONNECTIVITY DIODE:');
    console.log(`  * Page ID Masked:     ${maskedPageId}`);
    console.log(`  * Access Token:       ${maskedToken}`);

    const metaMode = (process.env.META_MODE || '').trim().toLowerCase();
    let connectionSuccess = false;
    let pageName = 'Review Nhà bạn';

    if (pageId && pageAccessToken) {
      if (metaMode === 'live') {
        console.log('🔗 Fetching connection details from Meta Graph API...');
        const client = createMetaClient({ pageId, pageAccessToken });
        const connResult = await testPageConnection(client);
        if (connResult.success && connResult.page) {
          connectionSuccess = true;
          pageName = connResult.page.name;
          console.log(`  * Page Name:          ${pageName}`);
          console.log('  * Connection Status:  READY 🟢');
        } else {
          console.error(`🛑 Meta API connection check failed: ${connResult.error}`);
          if (connResult.diagnosis) console.error(`💡 Diagnosis:\n${connResult.diagnosis}`);
          process.exit(1);
          return;
        }
      } else {
        connectionSuccess = true;
        console.log('  * Connection Status:  READY (Simulated Connection) 🟢');
      }
    } else {
      console.warn('⚠️ Credentials check skipped or failed due to missing env variables.');
      process.exit(1);
      return;
    }

    const preflightStatus = {
      preflightPassed: connectionSuccess,
      pageId: maskedPageId,
      pageName,
      generatedAt: isoNow(),
    };

    const preflightPath = join(JOBS_ROOT, jobId, 'facebook_preflight_status.json');
    writeFileSync(preflightPath, JSON.stringify(preflightStatus, null, 2) + '\n', 'utf8');
    console.log(`Preflight artifact written to: ${preflightPath}`);
    console.log('======================================================\n');
    process.exit(0);
    return;
  }

  // ---- LIVE MODE ----
  if (effectiveMode === 'LIVE') {
    // TRUTH GUARD (hotfix sau sự cố publish giả 2026-06-11): repo CHƯA có uploader
    // video/Reels thật (packages/facebook chỉ có publishTextPost /feed). Nhánh này
    // trước đây bịa postId/videoId bằng Math.random() rồi ghi state=PUBLISHED +
    // safety.published=true dù KHÔNG upload gì → UI báo "Đã đăng" trong khi Page
    // không có video. Chừng nào uploader thật chưa được implement, LIVE mode PHẢI
    // fail rõ ràng và TUYỆT ĐỐI không ghi manifest/registry/status/result.
    console.error(
      '🛑 REELS_UPLOAD_NOT_IMPLEMENTED (FACEBOOK_VIDEO_UPLOAD_NOT_IMPLEMENTED):',
    );
    console.error('  -> Live video upload CHƯA được implement trong repo này.');
    console.error('  -> KHÔNG có video nào được đăng lên Facebook.');
    console.error('  -> Manifest/registry/status GIỮ NGUYÊN — không có gì bị ghi.');
    console.error(
      '  -> Cần xây uploader thật ở round riêng: POST /{page_id}/video_reels (3-phase) hoặc POST /{page_id}/videos, kèm readback verify postId/permalink.',
    );
    process.exit(20);
    return;
  }
}

main().catch((err) => {
  console.error(`❌ Unexpected fatal exception: ${err.message}`);
  process.exit(1);
});
