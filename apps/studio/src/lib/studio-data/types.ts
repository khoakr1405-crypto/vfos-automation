/* =============================================================================
 * VFOS Studio — studio-data DTO types (Round UI-02)
 * -----------------------------------------------------------------------------
 * PURE types, KHÔNG import node:fs. An toàn để client component import (type-only)
 * mà không kéo server code vào client bundle. Server adapter (jobs.ts) import lại
 * các type này.
 * ========================================================================== */

import type { CtaReadinessSummary } from '@/lib/growth-data/cta-readiness';

export type GateState = 'pass' | 'fail' | 'warn';
export type AffiliateGate = 'pass' | 'fail' | 'warn';

export type VfosJobState =
  | 'CREATED'
  | 'WAITING_FOR_SOURCE_VIDEO'
  | 'SOURCE_READY'
  | 'READY_TO_RENDER'
  | 'RENDERING'
  | 'READY_FOR_OPERATOR_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'PACKAGED'
  | 'PUBLISHED'
  | 'FAILED';

export type StatusAccent = 'blue' | 'violet' | 'green' | 'amber' | 'cyan' | 'rose';

/**
 * Evidence-on-job (#5 G3 + G1 Slice 5): tổng số liệu ĐÃ ĐO cho job. Engagement
 * (views/clicks/conversions) additive từ manual snapshot post-level (tránh
 * double-count role). Revenue (M5) theo PRECEDENCE-KHÔNG-SUM giữa các nguồn:
 * shopee_affiliate_api > manual_csv > manual — không cộng dồn cùng khoản hoa hồng
 * qua nhiều tier. null khi job không có snapshot nào — KHÔNG bịa 0.
 */
export interface JobEvidenceSummary {
  /** Doanh thu affiliate (M5) bằng VND — theo nguồn precedence cao nhất hiện có. */
  revenue: number;
  clicks: number;
  conversions: number;
  views: number;
  /** Số snapshot MANUAL post-level đã đo cho job (0 = job chỉ có số Shopee). */
  snapshotCount: number;
  /** Mốc đo mới nhất (measuredAt manual hoặc periodEnd Shopee); null nếu không có. */
  lastMeasuredAt: string | null;
  /** Nguồn đang cung cấp con số revenue (minh bạch tiền — No-Go #6). */
  revenueSource: 'shopee_affiliate_api' | 'manual_csv' | 'manual' | null;
}

export interface OperatorJobDTO {
  id: string;
  title: string;
  lane: string;
  product: string;
  price: string;
  duration: string;
  /** Niche → Channel → Job (Phase 1): channelId bind trong manifest. null = job legacy chưa gán kênh. */
  channelId: string | null;
  /** Tên kênh thật từ config/channels.json nếu bind; '(chưa gán kênh)' cho job legacy. */
  suggestedChannel: string;
  /** Niche suy từ lane của channel bind (Command Center rollup #8). null = chưa gán
   * kênh hoặc lane không khớp niche active nào trong config/niches.json. */
  nicheId: string | null;
  nicheDisplayName: string | null;
  /** Batch cohort (#2 Phase B): set khi tạo nhiều job 1 lần. null = job đơn lẻ/legacy. */
  batchId: string | null;
  platform: 'tiktok' | 'facebook' | 'youtube';
  reason: string;
  state: VfosJobState;
  statusLabel: string;
  statusAccent: StatusAccent;
  cleanlinessStatus: string | null;
  sourceVideoPath: string | null;
  sourceVideoUrl: string | null;
  /** Identity của Product Card đã BIND vào job (snapshot lúc tạo job). Dùng để
   * đối chiếu với Product Card đang chọn ở Action 1 → phát hiện mismatch. */
  productBinding: {
    shortLink: string | null;
    shopId: string | null;
    itemId: string | null;
  };
  operatorDecision: 'PENDING' | 'APPROVED' | 'REJECTED';
  qaStatus: 'PASS' | 'FAIL' | 'PENDING' | null;
  canReview: boolean;
  pipeline: {
    source: GateState;
    script: GateState;
    voice: GateState;
    bgm: GateState;
    render: GateState;
    qa: GateState;
    affiliateLink: AffiliateGate;
  };
  previewUrl: string | null;
  hasPreview: boolean;
  errorLog?: { stage: string; error: string };
  ownerId: string | null;
  ownerValid: boolean;
  notes: string | null;
  /** Thời điểm tạo job (registry/manifest). Dùng gom batch theo ngày (#2). null = legacy. */
  createdAt: string | null;
  updatedAt: string | null;
  source?: {
    sourceMode?: string | null;
    sourceJobId?: string | null;
    productionAllowed?: boolean | null;
    warning?: string | null;
  } | null;
  /** Evidence-on-job (#5 G3): số liệu đã đo, join từ runtime snapshots. null = chưa đo. */
  evidence?: JobEvidenceSummary | null;
}

export interface ProductRowDTO {
  id: string;
  name: string;
  platform: string;
  ownerId: string | null;
  ownerValid: boolean;
  validationStatus: string | null;
  commission: string;
  laneFit: string;
  jobStatus: 'RUNNING' | 'FAILED' | 'WAITING_SOURCE' | 'REVIEW' | 'DONE';
  stateLabel: string;
  jobId: string;
  jobCount: number;
}

export interface OverviewSummary {
  generatedAt: string;
  activeLane: string;
  total: number;
  byState: Record<string, number>;
  readyForReview: number;
  failed: number;
  packaged: number;
  approved: number;
}

export interface PublishQueueItemDTO {
  jobId: string;
  laneId: string;
  productName: string | null;
  productBinding: {
    shortLink: string | null;
    shopId: string | null;
    itemId: string | null;
  };
  status: 'APPROVED' | 'PACKAGED' | 'READY_FOR_OPERATOR_REVIEW' | 'PUBLISHED_CANDIDATE' | 'UNKNOWN';
  previewUrl: string | null;
  suggestedChannel: string | null;
  platform: 'facebook' | 'tiktok' | 'youtube' | 'unknown';
  publishReadiness: 'ready' | 'blocked' | 'missing_package' | 'missing_approval' | 'unknown';
  dryRunStatus: 'not_run' | 'pass' | 'fail' | 'unknown';
  livePublishStatus: 'not_allowed_in_ui04';
  gateChecks: Array<{
    label: string;
    status: 'pass' | 'fail' | 'warn' | 'pending';
    detail?: string;
  }>;
  warnings: string[];
  source: 'real' | 'mock';
  captionContent: string | null;
  hashtagsContent: string | null;
  facebookTokenConfigured: boolean;
  livePublishEnabled: boolean;
  dryRunAvailable: boolean;
  dryRunCommand: string;
  payloadPreview: {
    jobId: string;
    productName: string | null;
    targetPlatform: string;
    targetChannel: string | null;
    videoPackageStatus: 'available' | 'missing';
    captionStatus: 'available' | 'missing';
    hashtagsStatus: 'available' | 'missing';
    affiliateLinkStatus: 'valid' | 'invalid';
    dryRunCommand: string;
  };
  // --- Round UI-06: local-only guarded live publish (sanitized, boolean-only) ---
  /** env VFOS_STUDIO_ALLOW_LIVE_PUBLISH === 'true' (sanitized boolean, never the raw value). */
  livePublishEnabledReason: string;
  /** Boolean only — FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN present server-side. Never the token. */
  facebookCredentialsConfigured: boolean;
  /** Job manifest already marked uploaded/published (or state PUBLISHED). */
  alreadyPublished: boolean;
  /** Exact phrase the Operator must type to confirm live publish: `PUBLISH <jobId>`. */
  confirmPhrase: string;
  /** Human-readable reasons live publish is currently blocked (gate failures). Empty = ready. */
  liveGateBlockedReasons: string[];
  /**
   * Round Affiliate Hub 03 — tóm tắt readiness CTA multi-touch (transport-safe).
   * Đính ở API boundary (publish-queue route); undefined/null = job chưa có
   * AffiliateCtaPlan. KHÔNG token/secret/raw link.
   */
  ctaReadiness?: CtaReadinessSummary | null;
}

/* =============================================================================
 * Round UI-06 — live publish preflight (server-evaluated, read-only)
 * ========================================================================== */

export interface LivePublishGate {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface LivePublishGateResult {
  jobId: string;
  jobExists: boolean;
  /** Raw manifest state, including PUBLISHED (not normalized). */
  rawState: string | null;
  productName: string | null;
  targetChannel: string | null;
  facebookCredentialsConfigured: boolean;
  alreadyPublished: boolean;
  gates: LivePublishGate[];
  /** Labels of failing gates — surfaced as blocked reasons. */
  blockedReasons: string[];
  /** All gates passed (excludes env flag, local-only, confirm phrase — checked in route). */
  gatesPassed: boolean;
  facebookPageIdConfigured?: boolean;
  facebookPageAccessTokenConfigured?: boolean;
  metaModeLive?: boolean;
  studioLivePublishEnabled?: boolean;
}

export interface LivePublishAuditRecord {
  action: 'LIVE_PUBLISH_FACEBOOK';
  jobId: string;
  requestedAt: string;
  localOnly: boolean;
  envLivePublishEnabled: boolean;
  /**
   * @deprecated Phase C bỏ confirm-phrase (one-click publish). Không còn được ghi;
   * giữ optional để log lịch sử cũ vẫn parse. Dùng `confirmMode` thay thế.
   */
  confirmPhraseMatched?: boolean;
  /** Cơ chế xác nhận của Operator. One-click: bấm thẳng nút, không confirm phrase. */
  confirmMode: 'one_click';
  /** Chủ đích thao tác — để audit rõ ngữ nghĩa về sau. */
  operatorIntent: 'one_click_publish';
  gateStatus: 'PASS' | 'BLOCKED';
  result: 'SUCCESS' | 'FAIL' | 'BLOCKED';
  exitCode: number | null;
  operatorSource: string;
}
