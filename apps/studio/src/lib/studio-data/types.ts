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
  | 'FAILED';

export type StatusAccent = 'blue' | 'violet' | 'green' | 'amber' | 'cyan' | 'rose';

export interface OperatorJobDTO {
  id: string;
  title: string;
  lane: string;
  product: string;
  price: string;
  duration: string;
  suggestedChannel: string;
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
  updatedAt: string | null;
  source?: {
    sourceMode?: string | null;
    sourceJobId?: string | null;
    productionAllowed?: boolean | null;
    warning?: string | null;
  } | null;
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
  confirmPhraseMatched: boolean;
  gateStatus: 'PASS' | 'BLOCKED';
  result: 'SUCCESS' | 'FAIL' | 'BLOCKED';
  exitCode: number | null;
  operatorSource: string;
}
