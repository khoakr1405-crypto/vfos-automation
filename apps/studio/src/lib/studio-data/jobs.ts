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

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolveInsideRepo } from './paths';
import type {
  GateState,
  OperatorJobDTO,
  OverviewSummary,
  ProductRowDTO,
  StatusAccent,
  VfosJobState,
} from './types';

export type {
  AffiliateGate,
  GateState,
  OperatorJobDTO,
  OverviewSummary,
  ProductRowDTO,
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
  review?: { operatorDecision?: 'PENDING' | 'APPROVED' | 'REJECTED' };
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
    errorLog,
    ownerId,
    ownerValid,
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
