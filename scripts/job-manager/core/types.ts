// Shared data types for the VFOS job-manager (extracted from
// scripts/vfos-job-manager.ts — God-file anatomy Nhịp 1).

export type JobState =
  | 'CREATED'
  // Video-first (Trend Scout POV): job tạo từ sourceVideoUrl, CHƯA có Product Card.
  // Production bị CHẶN (PRODUCT_CARD_MISSING) tới khi job:attach-product.
  | 'WAITING_FOR_PRODUCT'
  | 'WAITING_FOR_SOURCE_VIDEO'
  | 'SOURCE_READY'
  | 'READY_TO_RENDER'
  | 'RENDERING'
  | 'READY_FOR_OPERATOR_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'PACKAGED'
  | 'FAILED';

export interface JobManifest {
  jobVersion: 'v1';
  jobId: string;
  runId: string;
  productId: string | null;
  // Niche → Channel → Job binding (Phase 1). null = job legacy tạo trước khi có binding.
  channelId?: string | null;
  // Batch cohort (#2 Phase B). Set khi tạo nhiều job 1 lần (job:create --batch <id>).
  // null = job đơn lẻ / legacy. KHÔNG phải gate, chỉ để gom batch ở Command Center.
  batchId?: string | null;
  // Display-only: từ khóa tìm kiếm tiếng Trung suy ra từ tên VI (đi tìm source
  // Douyin/Taobao). KHÔNG phải productBinding, KHÔNG gate gì — chỉ tiện tham chiếu.
  chineseSearchName?: string | null;
  source: {
    // null = job video-first (Trend Scout) chưa gắn Product Card (WAITING_FOR_PRODUCT).
    productCardPath: string | null;
    sourceVideoPath: string | null;
    // URL video nguồn (Douyin/TikTok) — trước đây route source-url ghi untyped.
    sourceVideoUrl?: string | null;
    // ---- Trace fields (pipeline review ghi khi resolve clean source) ----
    // Trước đây orchestrator ghi qua `(source as any)` — model hoá để hết cast.
    cleanlinessStatus?: string | null;
    provider?: string | null;
    localPath?: string | null;
    approvedSourceVideoPath?: string | null;
    sourceVideoPathUsedByPipeline?: string | null;
    requestedProvider?: string | null;
    actualProvider?: string | null;
    sourceVideoProvider?: string | null;
    cleanlinessReportPath?: string | null;
    sourceResolvedAt?: string | null;
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
  // ---- Review pipeline fields (trước đây chỉ có trong JobManifest cục bộ của
  // review-video-orchestrator — hợp nhất về SSOT khi giải phẫu god-file) ----
  /** Source-subtitle scrub: mặc định BẬT (undefined/true). false = tắt cho job này. */
  scrubSourceSubtitle?: boolean;
  bgmPolicy?: 'BGM_REQUIRED' | 'ALLOW_NO_BGM_OPERATOR_OVERRIDE' | null;
  duration?: {
    sourceVideoDurationSec: number;
    voiceDurationSec: number;
    captionedPreviewDurationSec: number | null;
    durationMatchStatus: 'PASS' | 'FAIL';
  } | null;
}

export interface RegistryEntry {
  jobId: string;
  runId: string;
  state: JobState;
  productName: string | null;
  productCardPath: string | null;
  sourceVideoPath: string | null;
  captionedPreviewPath: string | null;
  operatorDecision: 'PENDING' | 'APPROVED' | 'REJECTED';
  batchId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Registry {
  registryVersion: 'v1';
  updatedAt: string;
  jobs: RegistryEntry[];
}

export interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  metrics: {
    duplicateHookDetected: boolean;
    repeatedProductNameCount: number;
    tooLongForVideo: boolean;
    ngramRepetitionDetected: boolean;
    visionGrounded: boolean;
  };
}

// ---------- channel binding (Niche → Channel → Job) ----------
export interface ChannelConfigEntry {
  channelId?: string;
  platform?: string;
  displayName?: string;
  lane?: string;
  status?: string;
}

export interface NicheConfigEntry {
  nicheId?: string;
  lane?: string;
  status?: string;
}
