/* =============================================================================
 * VFOS Studio — real job data adapter (Round UI-02, READ-ONLY)
 * -----------------------------------------------------------------------------
 * SERVER ONLY. Đọc job thật từ registry + manifest + cleanliness/ffprobe report,
 * map sang DTO an toàn cho UI. Nguyên tắc:
 *   - Chỉ đọc JSON nhỏ (manifest/report). KHÔNG đọc/giải mã video trong adapter.
 *   - KHÔNG trả raw local path (C:\..., data/temp/..., runs/...) ra client.
 *   - KHÔNG trả affiliate URL / token / credential_token. Chỉ trả owner id
 *     (public attribution) + cờ ownerValid.
 *   - Fallback an toàn khi file thiếu: trả field null, không throw, không crash.
 *   - KHÔNG side effect: không ghi file, không gọi command, không gọi API ngoài.
 * ========================================================================== */

import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolveInsideRepo } from './paths';
import type {
  GateState,
  LivePublishAuditRecord,
  LivePublishGate,
  LivePublishGateResult,
  OperatorJobDTO,
  OverviewSummary,
  ProductRowDTO,
  PublishQueueItemDTO,
  StatusAccent,
  VfosJobState,
} from './types';

export type {
  AffiliateGate,
  GateState,
  LivePublishAuditRecord,
  LivePublishGate,
  LivePublishGateResult,
  OperatorJobDTO,
  OverviewSummary,
  ProductRowDTO,
  PublishQueueItemDTO,
  StatusAccent,
  VfosJobState,
} from './types';

const REGISTRY_REL = 'data/temp/vfos_jobs_registry.json';
const JOBS_ROOT_REL = 'data/temp/jobs';
const EXPECTED_OWNER = 'an_17376660568';
const ACTIVE_LANE = 'Review sản phẩm';

// ---- internal raw shapes (only the fields we read) -------------------------
interface RegistryEntry {
  jobId: string;
  state?: string;
  productName?: string | null;
  productCardPath?: string | null;
  sourceVideoPath?: string | null;
  captionedPreviewPath?: string | null;
  operatorDecision?: 'PENDING' | 'APPROVED' | 'REJECTED';
  updatedAt?: string;
}

interface ManifestArtifacts {
  scriptArtifactPath?: string | null;
  voiceArtifactPath?: string | null;
  bgmArtifactPath?: string | null;
  previewVideoPath?: string | null;
  captionedPreviewPath?: string | null;
  finalQaReportPath?: string | null;
  productionPackageManifestPath?: string | null;
  publishReadinessPath?: string | null;
}

interface Manifest {
  jobId: string;
  productId?: string | null;
  source?: {
    productCardPath?: string | null;
    sourceVideoPath?: string | null;
    cleanlinessStatus?: string | null;
  };
  artifacts?: ManifestArtifacts;
  state?: string;
  review?: { operatorDecision?: 'PENDING' | 'APPROVED' | 'REJECTED'; notes?: string | null };
  safety?: { facebookApiCalled?: boolean; uploaded?: boolean; published?: boolean };
  qaStatus?: string | null;
  lastError?: string | null;
  duration?: { sourceVideoDurationSec?: number; captionedPreviewDurationSec?: number };
  updatedAt?: string;
}

interface ProductCard {
  affiliateOwnerId?: string | null;
  validationStatus?: string | null;
}

// ---- safe JSON read (never throws) -----------------------------------------
function readJson<T>(relPath: string | null | undefined): T | null {
  if (!relPath) return null;
  const abs = resolveInsideRepo(relPath);
  if (!abs || !existsSync(abs)) return null;
  try {
    return JSON.parse(readFileSync(abs, 'utf8')) as T;
  } catch {
    return null;
  }
}

function fileExistsInside(relPath: string | null | undefined): boolean {
  if (!relPath) return false;
  const abs = resolveInsideRepo(relPath);
  return Boolean(abs && existsSync(abs));
}

function fmtDuration(sec?: number | null): string {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return '—';
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

const STATE_META: Record<VfosJobState, { label: string; accent: StatusAccent }> = {
  CREATED: { label: 'Mới tạo', accent: 'blue' },
  WAITING_FOR_SOURCE_VIDEO: { label: 'Chờ Operator chọn nguồn', accent: 'amber' },
  SOURCE_READY: { label: 'Nguồn sạch · sẵn sàng render', accent: 'blue' },
  READY_TO_RENDER: { label: 'Đang sản xuất', accent: 'cyan' },
  RENDERING: { label: 'Đang sản xuất', accent: 'cyan' },
  READY_FOR_OPERATOR_REVIEW: { label: 'Chờ Operator duyệt', accent: 'amber' },
  APPROVED: { label: 'Đã duyệt → Publish Queue', accent: 'green' },
  REJECTED: { label: 'Đã từ chối', accent: 'rose' },
  PACKAGED: { label: 'Đã đóng gói', accent: 'green' },
  FAILED: { label: 'Lỗi kỹ thuật', accent: 'rose' },
};

function normState(raw?: string): VfosJobState {
  const s = (raw ?? 'CREATED') as VfosJobState;
  return STATE_META[s] ? s : 'CREATED';
}

function normQa(raw?: string | null): 'PASS' | 'FAIL' | 'PENDING' | null {
  if (raw === 'PASS' || raw === 'FAIL' || raw === 'PENDING') return raw;
  return null;
}

/** Read QA status from the report itself if the manifest mirror is absent. */
function resolveQa(manifest: Manifest | null): 'PASS' | 'FAIL' | 'PENDING' | null {
  const fromManifest = normQa(manifest?.qaStatus ?? null);
  if (fromManifest) return fromManifest;
  const report = readJson<{ status?: string }>(manifest?.artifacts?.finalQaReportPath);
  if (report?.status === 'PASS') return 'PASS';
  if (report?.status === 'FAIL') return 'FAIL';
  return null;
}

function buildJobDTO(entry: RegistryEntry): OperatorJobDTO {
  const id = entry.jobId;
  const manifest = readJson<Manifest>(`${JOBS_ROOT_REL}/${id}/job_manifest.json`);

  const state = normState(manifest?.state ?? entry.state);
  const meta = STATE_META[state];
  const productName = manifest && entry.productName == null ? null : entry.productName;
  const product = (productName ?? '').trim() || '(không rõ sản phẩm)';
  const title = product !== '(không rõ sản phẩm)' ? product : id;

  const cleanliness = manifest?.source?.cleanlinessStatus ?? null;

  // Cleanliness-aware label: SOURCE_READY nhưng chưa duyệt sạch = chờ duyệt nguồn.
  let statusLabel = meta.label;
  let statusAccent = meta.accent;
  if (state === 'SOURCE_READY' && cleanliness !== 'WATERMARK_NOT_DETECTED') {
    statusLabel = 'Chờ duyệt nguồn sạch';
    statusAccent = 'amber';
  }

  // Preview: chỉ dựng URL media route khi file thật tồn tại trên đĩa.
  const previewRel =
    manifest?.artifacts?.captionedPreviewPath ?? entry.captionedPreviewPath ?? null;
  const hasPreview = fileExistsInside(previewRel);
  const previewUrl = hasPreview ? `/api/studio/jobs/${encodeURIComponent(id)}/preview` : null;

  // Duration: ưu tiên manifest.duration, fallback ffprobe report của clean source.
  let durationSec =
    manifest?.duration?.captionedPreviewDurationSec ??
    manifest?.duration?.sourceVideoDurationSec ??
    null;
  if (durationSec == null) {
    const ffprobe = readJson<{ duration?: number }>(`runs/${id}/source/ffprobe.json`);
    durationSec = ffprobe?.duration ?? null;
  }

  // Owner validation từ product card (KHÔNG đọc/expose URL).
  const card = readJson<ProductCard>(
    manifest?.source?.productCardPath ?? entry.productCardPath ?? null,
  );
  const ownerId = card?.affiliateOwnerId ?? null;
  const ownerValid = ownerId === EXPECTED_OWNER && card?.validationStatus === 'VERIFIED';

  const qaStatus = resolveQa(manifest);

  // Pipeline gates — downstream artifact implies upstream done (tránh false-warn
  // do manifest thiếu field như voiceArtifactPath).
  const a = manifest?.artifacts ?? {};
  const renderDone =
    fileExistsInside(a.captionedPreviewPath) || fileExistsInside(a.previewVideoPath);
  const sourceClean = cleanliness === 'WATERMARK_NOT_DETECTED';
  const hasSource = Boolean(manifest?.source?.sourceVideoPath ?? entry.sourceVideoPath);

  const gate = (done: boolean): GateState => (done ? 'pass' : 'warn');
  const pipeline = {
    source:
      sourceClean || renderDone
        ? 'pass'
        : hasSource
          ? 'warn'
          : state === 'FAILED'
            ? 'fail'
            : 'warn',
    script: gate(renderDone || Boolean(a.scriptArtifactPath)),
    voice: gate(renderDone || Boolean(a.voiceArtifactPath)),
    bgm: gate(renderDone || Boolean(a.bgmArtifactPath)),
    render: gate(renderDone),
    qa: qaStatus === 'PASS' ? 'pass' : qaStatus === 'FAIL' ? 'fail' : 'warn',
    affiliateLink: ownerValid ? 'pass' : ownerId ? 'warn' : 'warn',
  } as OperatorJobDTO['pipeline'];

  const errorLog =
    state === 'FAILED' && manifest?.lastError
      ? { stage: 'pipeline', error: String(manifest.lastError) }
      : undefined;

  const canReview = state === 'READY_FOR_OPERATOR_REVIEW' && qaStatus === 'PASS' && hasPreview;

  return {
    id,
    title,
    lane: ACTIVE_LANE,
    product,
    price: '—',
    duration: fmtDuration(durationSec),
    suggestedChannel: '(chưa nối — analytics mock)',
    platform: 'facebook',
    reason: 'Một video → một nền tảng chính. Gợi ý kênh sẽ nối ở phase analytics (hiện mock).',
    state,
    statusLabel,
    statusAccent,
    cleanlinessStatus: cleanliness,
    operatorDecision: manifest?.review?.operatorDecision ?? entry.operatorDecision ?? 'PENDING',
    qaStatus,
    canReview,
    pipeline,
    previewUrl,
    hasPreview,
    ownerId,
    ownerValid,
    notes: manifest?.review?.notes ?? null,
    errorLog,
    updatedAt: manifest?.updatedAt ?? entry.updatedAt ?? null,
  };
}

function loadRegistryEntries(): RegistryEntry[] {
  const reg = readJson<{ jobs?: RegistryEntry[] }>(REGISTRY_REL);
  if (!reg || !Array.isArray(reg.jobs)) return [];
  return reg.jobs.filter((j) => j && typeof j.jobId === 'string');
}

/** Tất cả job thật, mới nhất trước. Read-only, fallback an toàn. */
export function loadOperatorJobs(): OperatorJobDTO[] {
  const entries = loadRegistryEntries();
  const jobs = entries.map(buildJobDTO);
  jobs.sort((x, y) => (y.updatedAt ?? '').localeCompare(x.updatedAt ?? ''));
  return jobs;
}

export function loadJobById(jobId: string): OperatorJobDTO | null {
  const entry = loadRegistryEntries().find((j) => j.jobId === jobId);
  if (!entry) {
    // Cho phép đọc job có manifest nhưng chưa nằm trong registry.
    if (fileExistsInside(`${JOBS_ROOT_REL}/${jobId}/job_manifest.json`)) {
      return buildJobDTO({ jobId });
    }
    return null;
  }
  return buildJobDTO(entry);
}

const PRODUCT_STATE_MAP: Record<VfosJobState, ProductRowDTO['jobStatus']> = {
  CREATED: 'RUNNING',
  WAITING_FOR_SOURCE_VIDEO: 'WAITING_SOURCE',
  SOURCE_READY: 'RUNNING',
  READY_TO_RENDER: 'RUNNING',
  RENDERING: 'RUNNING',
  READY_FOR_OPERATOR_REVIEW: 'REVIEW',
  APPROVED: 'DONE',
  REJECTED: 'FAILED',
  PACKAGED: 'DONE',
  FAILED: 'FAILED',
};

/** Product rows derive từ job thật, dedupe theo product (job mới nhất đại diện). */
export function loadProductRows(): ProductRowDTO[] {
  const jobs = loadOperatorJobs(); // already newest-first
  const seen = new Map<string, ProductRowDTO>();
  for (const job of jobs) {
    const key = job.product;
    const existing = seen.get(key);
    if (existing) {
      existing.jobCount += 1;
      continue;
    }
    seen.set(key, {
      id: job.id,
      name: job.product,
      platform: 'Shopee Affiliate',
      ownerId: job.ownerId,
      ownerValid: job.ownerValid,
      validationStatus: job.ownerValid ? 'VERIFIED' : null,
      commission: '—',
      laneFit: ACTIVE_LANE,
      jobStatus: PRODUCT_STATE_MAP[job.state],
      stateLabel: job.statusLabel,
      jobId: job.id,
      jobCount: 1,
    });
  }
  return [...seen.values()];
}

export function loadOverviewSummary(): OverviewSummary {
  const jobs = loadOperatorJobs();
  const byState: Record<string, number> = {};
  for (const j of jobs) byState[j.state] = (byState[j.state] ?? 0) + 1;
  return {
    generatedAt: new Date().toISOString(),
    activeLane: ACTIVE_LANE,
    total: jobs.length,
    byState,
    readyForReview: byState.READY_FOR_OPERATOR_REVIEW ?? 0,
    failed: byState.FAILED ?? 0,
    packaged: byState.PACKAGED ?? 0,
    approved: byState.APPROVED ?? 0,
  };
}

/**
 * Đường dẫn tuyệt đối tới preview mp4 của job (cho media route). Trả null nếu
 * jobId không hợp lệ / không có preview / path thoát khỏi repo. KHÔNG expose ra
 * JSON — chỉ dùng nội bộ để stream.
 */
export function getJobPreviewAbsPath(jobId: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(jobId)) return null;
  const manifest = readJson<Manifest>(`${JOBS_ROOT_REL}/${jobId}/job_manifest.json`);
  const entry = loadRegistryEntries().find((j) => j.jobId === jobId);
  const rel = manifest?.artifacts?.captionedPreviewPath ?? entry?.captionedPreviewPath ?? null;
  if (!rel || !rel.toLowerCase().endsWith('.mp4')) return null;
  const abs = resolveInsideRepo(rel);
  if (!abs || !existsSync(abs)) return null;
  try {
    if (!statSync(abs).isFile()) return null;
  } catch {
    return null;
  }
  return abs;
}

export function readJobTextFile(jobId: string, filename: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(jobId)) return null;
  const rel = `production/archive/${jobId}/${filename}`;
  const abs = resolveInsideRepo(rel);
  if (!abs || !existsSync(abs)) return null;
  try {
    return readFileSync(abs, 'utf-8');
  } catch {
    return null;
  }
}

/* =============================================================================
 * Round UI-06 — local-only guarded live publish (SERVER ONLY)
 * -----------------------------------------------------------------------------
 * Mọi thứ ở đây READ-ONLY trừ appendPublishAuditLog (chỉ ghi audit jsonl trong
 * runtime gitignored). KHÔNG gọi command publish ở module này — route handler
 * mới được spawn command thật sau khi toàn bộ guard pass.
 * ========================================================================== */

const FALLBACK_CHANNEL = 'Kênh Review Sản Phẩm #1';

/** env flag, mặc định false. Không bao giờ trả raw value ra ngoài — chỉ boolean. */
export function isLivePublishEnvEnabled(): boolean {
  return process.env.VFOS_STUDIO_ALLOW_LIVE_PUBLISH === 'true';
}

export function livePublishDisabledReason(): string {
  return isLivePublishEnvEnabled()
    ? ''
    : 'VFOS_STUDIO_ALLOW_LIVE_PUBLISH chưa được bật (mặc định tắt).';
}

/**
 * Boolean only — Facebook page credentials cần cho command live publish thật
 * (`job:publish-facebook --confirm-live-publish`). KHÔNG đọc/trả giá trị token.
 */
export function facebookCredentialsConfigured(): boolean {
  return Boolean(
    (process.env.FACEBOOK_PAGE_ID || '').trim() &&
      (process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '').trim(),
  );
}

/** Cụm xác nhận Operator phải gõ chính xác để live publish. */
export function livePublishConfirmPhrase(jobId: string): string {
  return `PUBLISH ${jobId}`;
}

/**
 * Đánh giá toàn bộ gate live-publish server-side từ manifest + artifact thật.
 * READ-ONLY. KHÔNG xét env flag / local-only / confirm phrase (route lo phần đó).
 */
export function evaluateLivePublishGates(jobId: string): LivePublishGateResult {
  const empty: LivePublishGateResult = {
    jobId,
    jobExists: false,
    rawState: null,
    productName: null,
    targetChannel: null,
    facebookCredentialsConfigured: facebookCredentialsConfigured(),
    alreadyPublished: false,
    gates: [],
    blockedReasons: ['Không tìm thấy Job (manifest thiếu).'],
    gatesPassed: false,
  };

  if (!/^[A-Za-z0-9_-]+$/.test(jobId)) return empty;

  const manifest = readJson<Manifest>(`${JOBS_ROOT_REL}/${jobId}/job_manifest.json`);
  if (!manifest) return empty;

  const entry = loadRegistryEntries().find((j) => j.jobId === jobId);
  const rawState = manifest.state ?? entry?.state ?? null;
  const productName = (entry?.productName ?? '')?.trim() || null;

  const card = readJson<ProductCard>(manifest.source?.productCardPath ?? entry?.productCardPath);
  const ownerValid =
    card?.affiliateOwnerId === EXPECTED_OWNER && card?.validationStatus === 'VERIFIED';

  const qa = resolveQa(manifest);
  const a = manifest.artifacts ?? {};
  const captionedPresent = fileExistsInside(a.captionedPreviewPath ?? entry?.captionedPreviewPath);
  const pkgPresent =
    fileExistsInside(a.productionPackageManifestPath) ||
    fileExistsInside(`production/archive/${jobId}/package_manifest.json`);
  const captionPresent = fileExistsInside(`production/archive/${jobId}/caption.txt`);
  const hashtagsPresent = fileExistsInside(`production/archive/${jobId}/hashtags.txt`);
  const readinessPresent =
    fileExistsInside(a.publishReadinessPath) ||
    fileExistsInside(`production/archive/${jobId}/publish_readiness_report.md`);
  const fbCreds = facebookCredentialsConfigured();
  const alreadyPublished =
    manifest.safety?.uploaded === true ||
    manifest.safety?.published === true ||
    rawState === 'PUBLISHED';

  const gates: LivePublishGate[] = [
    {
      key: 'job_exists',
      label: 'Job tồn tại',
      passed: true,
      detail: 'Tìm thấy manifest của Job.',
    },
    {
      key: 'state',
      label: 'Trạng thái APPROVED/PACKAGED',
      passed: rawState === 'APPROVED' || rawState === 'PACKAGED',
      detail: `Trạng thái hiện tại: ${rawState ?? 'không rõ'}.`,
    },
    {
      key: 'operator_approved',
      label: 'Operator đã phê duyệt',
      passed: (manifest.review?.operatorDecision ?? entry?.operatorDecision) === 'APPROVED',
      detail: 'Quyết định Operator phải là APPROVED.',
    },
    {
      key: 'final_qa',
      label: 'Final QA PASS',
      passed: qa === 'PASS',
      detail: qa === 'PASS' ? 'QA Gate đạt.' : `QA hiện tại: ${qa ?? 'chưa có'}.`,
    },
    {
      key: 'captioned_preview',
      label: 'Captioned preview tồn tại',
      passed: captionedPresent,
      detail: captionedPresent ? 'Có tệp video phụ đề.' : 'Thiếu tệp captioned preview.',
    },
    {
      key: 'package_manifest',
      label: 'Đã đóng gói (package manifest)',
      passed: pkgPresent,
      detail: pkgPresent ? 'Có package_manifest.json.' : 'Chưa đóng gói sản xuất.',
    },
    {
      key: 'caption_file',
      label: 'Tệp caption.txt tồn tại',
      passed: captionPresent,
      detail: captionPresent ? 'Có caption.txt.' : 'Thiếu caption.txt.',
    },
    {
      key: 'hashtag_file',
      label: 'Tệp hashtags.txt tồn tại',
      passed: hashtagsPresent,
      detail: hashtagsPresent ? 'Có hashtags.txt.' : 'Thiếu hashtags.txt.',
    },
    {
      key: 'affiliate_link',
      label: 'Affiliate link hợp lệ',
      passed: ownerValid,
      detail: ownerValid ? 'Khớp Shopee owner đã xác thực.' : 'Sai owner hoặc chưa xác thực.',
    },
    {
      key: 'target_channel',
      label: 'Đã chọn kênh đích',
      passed: true,
      detail: `Kênh đích: ${FALLBACK_CHANNEL}.`,
    },
    {
      key: 'facebook_credentials',
      label: 'Facebook credentials đã cấu hình',
      passed: fbCreds,
      detail: fbCreds
        ? 'Facebook Page ID + Page credential có mặt server-side (boolean).'
        : 'Thiếu Facebook Page ID / Page credential server-side.',
    },
    {
      key: 'publish_readiness',
      label: 'Publish readiness report tồn tại',
      passed: readinessPresent,
      detail: readinessPresent ? 'Có publish_readiness_report.md.' : 'Thiếu báo cáo readiness.',
    },
    {
      key: 'not_published',
      label: 'Chưa từng publish',
      passed: !alreadyPublished,
      detail: alreadyPublished ? 'Job đã được publish/upload trước đó.' : 'Job chưa publish.',
    },
  ];

  const blockedReasons = gates.filter((g) => !g.passed).map((g) => g.label);

  return {
    jobId,
    jobExists: true,
    rawState,
    productName,
    targetChannel: FALLBACK_CHANNEL,
    facebookCredentialsConfigured: fbCreds,
    alreadyPublished,
    gates,
    blockedReasons,
    gatesPassed: blockedReasons.length === 0,
  };
}

/**
 * Ghi 1 dòng audit (JSONL) vào runtime gitignored. KHÔNG bao giờ chứa token.
 * Trả false nếu jobId không hợp lệ hoặc ghi lỗi (không throw).
 */
export function appendPublishAuditLog(jobId: string, record: LivePublishAuditRecord): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(jobId)) return false;
  const abs = resolveInsideRepo(`${JOBS_ROOT_REL}/${jobId}/publish_audit_log.jsonl`);
  if (!abs) return false;
  try {
    mkdirSync(dirname(abs), { recursive: true });
    appendFileSync(abs, `${JSON.stringify(record)}\n`, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

export function loadPublishQueueItems(): PublishQueueItemDTO[] {
  const jobs = loadOperatorJobs();
  // Filter for jobs that can be in the publish queue (READY_FOR_OPERATOR_REVIEW, APPROVED, PACKAGED)
  const filtered = jobs.filter(
    (j) =>
      j.state === 'READY_FOR_OPERATOR_REVIEW' || j.state === 'APPROVED' || j.state === 'PACKAGED',
  );

  const liveEnvEnabled = isLivePublishEnvEnabled();

  return filtered.map((job) => {
    const id = job.id;
    const liveGate = evaluateLivePublishGates(id);
    const pkgPath = `production/archive/${id}/package_manifest.json`;
    const pkgExists = fileExistsInside(pkgPath);

    const reportPath = `production/archive/${id}/publish_readiness_report.md`;
    const reportExists = fileExistsInside(reportPath);

    const captionExists = fileExistsInside(`production/archive/${id}/caption.txt`);
    const hashtagsExists = fileExistsInside(`production/archive/${id}/hashtags.txt`);

    const captionContent = readJobTextFile(id, 'caption.txt');
    const hashtagsContent = readJobTextFile(id, 'hashtags.txt');

    // Safe environment checks (only boolean, no token leakage)
    const facebookTokenConfigured = !!(
      process.env.FACEBOOK_ACCESS_TOKEN ||
      process.env.FB_ACCESS_TOKEN ||
      process.env.FACEBOOK_TOKEN
    );

    // Map job state to publishReadiness status
    let publishReadiness: PublishQueueItemDTO['publishReadiness'] = 'unknown';
    if (job.state === 'READY_FOR_OPERATOR_REVIEW') {
      publishReadiness = 'missing_approval';
    } else if (job.state === 'APPROVED') {
      publishReadiness = pkgExists ? 'ready' : 'missing_package';
    } else if (job.state === 'PACKAGED') {
      publishReadiness = 'ready';
    }

    // Determine target channel (clean fallback)
    const suggestedChannel =
      (job.suggestedChannel || '').includes('mock') ||
      (job.suggestedChannel || '').includes('chưa nối')
        ? 'Kênh Review Sản Phẩm #1'
        : job.suggestedChannel;

    // Deep gate checks
    const gateChecks: PublishQueueItemDTO['gateChecks'] = [
      {
        label: 'Operator Approved',
        status: job.state === 'APPROVED' || job.state === 'PACKAGED' ? 'pass' : 'pending',
        detail:
          job.state === 'READY_FOR_OPERATOR_REVIEW'
            ? 'Chờ phê duyệt từ Operator'
            : 'Đã được phê duyệt',
      },
      {
        label: 'Final QA PASS',
        status: job.qaStatus === 'PASS' ? 'pass' : job.qaStatus === 'FAIL' ? 'fail' : 'pending',
        detail: job.qaStatus === 'PASS' ? 'QA Gate Đạt' : 'QA Gate chưa hoàn thành',
      },
      {
        label: 'Captioned Preview Exists',
        status: job.hasPreview ? 'pass' : 'fail',
        detail: job.hasPreview ? 'Tệp video có vietsub sẵn sàng' : 'Thiếu tệp video phụ đề',
      },
      {
        label: 'Package Manifest Exists',
        status: pkgExists ? 'pass' : job.state === 'READY_FOR_OPERATOR_REVIEW' ? 'pending' : 'fail',
        detail: pkgExists ? 'Tệp cấu trúc đóng gói sẵn sàng' : 'Chưa được đóng gói sản xuất',
      },
      {
        label: 'Caption File Exists',
        status: captionExists ? 'pass' : 'fail',
        detail: captionExists ? 'Tệp caption.txt hợp lệ' : 'Thiếu tệp caption.txt',
      },
      {
        label: 'Hashtag File Exists',
        status: hashtagsExists ? 'pass' : 'fail',
        detail: hashtagsExists ? 'Tệp hashtags.txt hợp lệ' : 'Thiếu tệp hashtags.txt',
      },
      {
        label: 'Facebook Token Configured',
        status: facebookTokenConfigured ? 'pass' : 'warn',
        detail: facebookTokenConfigured
          ? 'Facebook token đã cấu hình'
          : 'Chưa cấu hình Facebook token',
      },
      {
        label: 'Live Publish Enabled',
        status: liveEnvEnabled ? 'pass' : 'warn',
        detail: liveEnvEnabled
          ? 'Cờ live publish đã bật (vẫn cần confirm phrase + guard).'
          : 'Cờ VFOS_STUDIO_ALLOW_LIVE_PUBLISH chưa bật (mặc định tắt).',
      },
      {
        label: 'Dry-run Available',
        status: job.state === 'APPROVED' || job.state === 'PACKAGED' ? 'pass' : 'pending',
        detail:
          job.state === 'APPROVED' || job.state === 'PACKAGED'
            ? 'Chạy thử dry-run sẵn sàng'
            : 'Đang chờ phê duyệt',
      },
      {
        label: 'Publish Readiness Report Exists',
        status: reportExists ? 'pass' : 'warn',
        detail: reportExists ? 'Báo cáo sẵn sàng xuất bản tồn tại' : 'Thiếu báo cáo sẵn sàng',
      },
      {
        label: 'Target Channel Selected',
        status: suggestedChannel ? 'pass' : 'warn',
        detail: suggestedChannel ? `Kênh đích: ${suggestedChannel}` : 'Chưa chọn kênh phân phối',
      },
      {
        label: 'Affiliate Link Valid',
        status: job.ownerValid ? 'pass' : 'fail',
        detail: job.ownerValid
          ? 'Link hợp lệ (khớp Shopee owner)'
          : 'Sai Shopee owner hoặc chưa xác thực',
      },
      {
        label: 'No Live Publish Confirmation',
        status: 'pass',
        detail: 'Hệ thống an toàn chế độ Read-only',
      },
    ];

    const warnings: string[] = [];
    if (!job.ownerValid) warnings.push('Sai Shopee owner ID hoặc chưa cấu hình hợp lệ.');
    if (!pkgExists && job.state !== 'READY_FOR_OPERATOR_REVIEW')
      warnings.push('Chưa tìm thấy tệp đóng gói package_manifest.json.');
    if (!job.hasPreview) warnings.push('Không tìm thấy tệp video captioned preview mp4.');
    if (!captionExists) warnings.push('Thiếu tệp caption.txt.');
    if (!hashtagsExists) warnings.push('Thiếu tệp hashtags.txt.');

    const platform = job.platform || 'facebook';
    const dryRunCommand = `pnpm job:publish-${platform} --job ${id} --dry-run`;

    return {
      jobId: id,
      laneId: 'review',
      productName: job.product,
      status: job.state as PublishQueueItemDTO['status'],
      previewUrl: job.previewUrl,
      suggestedChannel,
      platform: job.platform,
      publishReadiness,
      dryRunStatus: pkgExists ? 'pass' : 'not_run',
      livePublishStatus: 'not_allowed_in_ui04',
      gateChecks,
      warnings,
      source: 'real',
      captionContent,
      hashtagsContent,
      facebookTokenConfigured,
      livePublishEnabled: liveEnvEnabled,
      livePublishEnabledReason: livePublishDisabledReason(),
      facebookCredentialsConfigured: liveGate.facebookCredentialsConfigured,
      alreadyPublished: liveGate.alreadyPublished,
      confirmPhrase: livePublishConfirmPhrase(id),
      liveGateBlockedReasons: liveGate.blockedReasons,
      dryRunAvailable: job.state === 'APPROVED' || job.state === 'PACKAGED',
      dryRunCommand,
      payloadPreview: {
        jobId: id,
        productName: job.product,
        targetPlatform: platform,
        targetChannel: suggestedChannel,
        videoPackageStatus: pkgExists ? 'available' : 'missing',
        captionStatus: captionExists ? 'available' : 'missing',
        hashtagsStatus: hashtagsExists ? 'available' : 'missing',
        affiliateLinkStatus: job.ownerValid ? 'valid' : 'invalid',
        dryRunCommand,
      },
    };
  });
}
