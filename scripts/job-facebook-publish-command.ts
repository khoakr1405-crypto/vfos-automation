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
import { publishReelToPage } from '../packages/facebook/src/publish-reels.js';
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
  /**
   * Phân biệt API publish với public visibility (sự cố 1028983246151885):
   * Graph readback xanh ≠ nick ngoài xem được. UNCONFIRMED cho tới khi Operator
   * xác nhận bằng tài khoản ngoài → PUBLIC_CONFIRMED (hoặc NOT_PUBLIC nếu bị hold).
   */
  publishVisibility?: 'UNCONFIRMED' | 'PUBLIC_CONFIRMED' | 'NOT_PUBLIC';
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
  // Uploader Reels THẬT (Milestone M1 — thay TRUTH GUARD hotfix 2026-06-11).
  // Truth rules: KHÔNG Math.random ID, KHÔNG ghi PUBLISHED khi Graph readback chưa
  // verify id + permalink thật. Fail SAU finish-phase → ghi uploaded=true (khóa
  // double-publish) nhưng published vẫn false.
  if (effectiveMode === 'LIVE') {
    // Defense-in-depth: LIVE chỉ chạy khi META_MODE=live (cùng chuẩn publishTextPost).
    const metaMode = (process.env.META_MODE || '').trim().toLowerCase();
    if (metaMode !== 'live') {
      console.error(
        `🛑 META_MODE_NOT_LIVE: META_MODE='${metaMode || 'unset'}' — live publish bị chặn.`,
      );
      console.error('  -> KHÔNG có API call nào được thực hiện. Manifest/registry GIỮ NGUYÊN.');
      process.exit(15);
      return;
    }

    // Precheck kết nối Page (GET read-only) — validate token + lấy pageName thật
    // TRƯỚC khi đụng upload. Token lỗi thì fail ở đây, không upload dở dang.
    console.log('🔗 Precheck: xác thực token & Page qua Graph API (read-only)...');
    const client = createMetaClient({ pageId, pageAccessToken });
    const connResult = await testPageConnection(client);
    if (!connResult.success || !connResult.page) {
      console.error(`🛑 PAGE_CONNECTION_FAILED: ${connResult.error}`);
      if (connResult.diagnosis) console.error(`💡 Diagnosis:\n${connResult.diagnosis}`);
      console.error('  -> KHÔNG có video nào được upload. Manifest/registry GIỮ NGUYÊN.');
      process.exit(16);
      return;
    }
    const pageName = connResult.page.name;
    console.log(`  * Page Name: ${pageName}`);

    // Description: caption + affiliate link + hashtags chưa nằm sẵn trong caption.
    const extraTags = hashtags.filter((tag) => !captionText.includes(tag));
    const description = [captionText, `🛒 ${affiliateLink}`, extraTags.join(' ')]
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .join('\n\n');

    console.log('🚀 LIVE REELS UPLOAD — 3-phase upload thật bắt đầu.');
    console.log(`  * Video: ${captionedRel}`);
    const reelResult = await publishReelToPage(pageId, pageAccessToken, {
      videoFilePath: captionedAbs as string,
      description,
    });

    if (!reelResult.success) {
      console.error(`🛑 LIVE_PUBLISH_FAILED (phase: ${reelResult.phase}): ${reelResult.error}`);
      if (reelResult.diagnosis) console.error(`💡 ${reelResult.diagnosis}`);

      if (reelResult.uploadAccepted) {
        // Facebook ĐÃ nhận video (finish OK) nhưng verify fail/timeout —
        // ghi sự thật một phần: uploaded=true (safety lock chặn double-publish),
        // published vẫn FALSE, state GIỮ PACKAGED.
        manifest.safety.facebookApiCalled = true;
        manifest.safety.uploaded = true;
        manifest.safety.published = false;
        manifest.lastError = `PUBLISH_VERIFY_FAILED:${reelResult.phase}`;
        saveManifest(manifest);
        updateRegistryFromManifest(manifest);
        console.error('  -> Upload ĐÃ được Facebook chấp nhận nhưng CHƯA verify được permalink.');
        console.error('  -> KHÔNG ghi PUBLISHED. Safety lock uploaded=true đã bật để chặn đăng lại.');
        console.error('  -> Operator kiểm tra Page thủ công trước khi quyết định bước tiếp.');
        process.exit(22);
        return;
      }

      console.error('  -> KHÔNG có video nào được đăng. Manifest/registry GIỮ NGUYÊN.');
      process.exit(21);
      return;
    }

    // success=true ⇒ verified=true theo contract publishReelToPage (Graph readback thật).
    // NHƯNG: readback chỉ chứng minh API publish — KHÔNG chứng minh nick ngoài xem được.
    console.log('✅ Đã đăng qua API (Graph readback) — chờ xác nhận hiển thị công khai:');
    console.log(`  * Video ID:  ${reelResult.videoId}`);
    console.log(`  * Permalink: ${reelResult.permalinkUrl}`);
    console.log('  ⚠️ publishVisibility = UNCONFIRMED — KHÔNG coi là "đăng thành công" cho tới');
    console.log('     khi Operator mở permalink bằng tài khoản KHÔNG phải admin và xác nhận.');

    const publishedAt = isoNow();
    manifest.state = 'PUBLISHED';
    manifest.safety.facebookApiCalled = true;
    manifest.safety.uploaded = true;
    manifest.safety.published = true;
    manifest.publishVisibility = 'UNCONFIRMED';
    manifest.lastError = null;
    saveManifest(manifest);
    updateRegistryFromManifest(manifest);

    const statusPayload = {
      state: 'PUBLISHED',
      generatedAt: publishedAt,
      publishVisibility: 'UNCONFIRMED',
      facebook: {
        pageId: maskedPageId,
        pageName,
        postId: reelResult.videoId,
        videoId: reelResult.videoId,
        permalinkUrl: reelResult.permalinkUrl,
        published: true,
        verifiedByGraphReadback: true,
        apiPublishConfirmed: true,
        publicVisibilityConfirmed: false,
      },
    };
    const statusPath = join(JOBS_ROOT, jobId, 'facebook_publish_status.json');
    writeFileSync(statusPath, `${JSON.stringify(statusPayload, null, 2)}\n`, 'utf8');

    const resultPayload = {
      jobId,
      mode: 'LIVE',
      publishedAt,
      pageId: maskedPageId,
      pageName,
      videoId: reelResult.videoId,
      permalinkUrl: reelResult.permalinkUrl,
      videoFile: captionedRel,
      caption: captionText,
      affiliateLink,
      hashtags,
      verification: {
        graphReadback: true,
        verifiedAt: publishedAt,
        apiPublishConfirmed: true,
        publicVisibilityConfirmed: false,
        publishVisibility: 'UNCONFIRMED',
        note: 'Graph readback chỉ chứng minh API publish. Public visibility cần Operator xác nhận bằng tài khoản ngoài.',
      },
    };
    const resultPath = join(PACKAGE_ROOT, jobId, 'facebook_publish_result.json');
    writeFileSync(resultPath, `${JSON.stringify(resultPayload, null, 2)}\n`, 'utf8');

    console.log(`Status artifact:  ${statusPath}`);
    console.log(`Result artifact:  ${resultPath}`);
    console.log('======================================================');
    process.exit(0);
    return;
  }
}

main().catch((err) => {
  console.error(`❌ Unexpected fatal exception: ${err.message}`);
  process.exit(1);
});
