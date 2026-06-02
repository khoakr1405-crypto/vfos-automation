/* =============================================================================
 * VFOS Studio — studio-data DTO types (Round UI-02)
 * -----------------------------------------------------------------------------
 * PURE types, KHÔNG import node:fs. An toàn để client component import (type-only)
 * mà không kéo server code vào client bundle. Server adapter (jobs.ts) import lại
 * các type này.
 * ========================================================================== */

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
}

