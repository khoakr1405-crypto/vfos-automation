/* =============================================================================
 * VFOS Studio — Type definitions (data-shape contract)
 * -----------------------------------------------------------------------------
 * Pure types, KHÔNG chứa runtime value. Đây là "contract" ổn định mà cả mock
 * data (lib/data/*) lẫn backend thật ở round sau đều phải tuân theo — UI import
 * type từ đây qua barrel @/lib/data nên không phụ thuộc nguồn dữ liệu.
 * Lưu ý: literal type suy ra từ const value (vd PipelineStage) đặt CẠNH const
 * trong lib/data/catalog.ts, không nằm ở đây.
 * ========================================================================== */

import type { AccentKey } from './nav';

// --- Ngách / Lane — đúng 3 lane VFOS ---
export type LaneId = 'review' | 'cau-ca' | 'rua-xe';
export type Lane = { id: LaneId; label: string; accent: AccentKey };

// --- Nền tảng — đúng 3 nền tảng VFOS ---
export type PlatformId = 'facebook' | 'tiktok' | 'youtube';
export type Platform = { id: PlatformId; label: string; accent: AccentKey };

// --- KPI ---
export type Kpi = {
  label: string;
  value: string;
  delta?: string;
  trend?: 'up' | 'down' | 'flat';
  accent: AccentKey;
};

// --- Cụm kênh & kênh ---
export type ChannelRow = {
  platform: PlatformId;
  views: string;
  ctr: string;
  revenue: string;
  status: 'active' | 'review' | 'paused';
};
export type ChannelCluster = { laneId: LaneId; name: string; channels: ChannelRow[] };

// --- Sản phẩm & link affiliate ---
export type ProductStatus = 'active' | 'out-of-stock';
export type Product = {
  id: string;
  name: string;
  price: string;
  laneId: LaneId;
  /** MOCK affiliate URL — không click ra ngoài, không gọi API. */
  affiliateLink: string;
  status: ProductStatus;
};

// --- Pipeline / Job ---
export type Job = {
  id: string;
  title: string;
  laneId: LaneId;
  productId: string;
  platform: PlatformId;
  /** index vào PIPELINE_STAGES — stage hiện tại đang chạy / chờ. */
  stageIndex: number;
  status: 'running' | 'waiting' | 'manual' | 'blocked' | 'done';
  updatedAt: string;
};

// --- Raw Visual AI ---
export type RawVisual = {
  id: string;
  file: string;
  duration: string;
  ratio: string;
  status: 'ready' | 'processing' | 'rejected';
  engine: string;
};

// --- Script / Voice / BGM / Render ---
export type VoiceSetting = { label: string; value: string };
export type BgmTrack = { id: string; name: string; mood: string; uses: number; selected?: boolean };
export type RenderSetting = { label: string; value: string };

// --- Hiệu suất / Analytics ---
export type RevenueShare = { laneId: LaneId; percent: number };
export type PlatformRevenue = { platform: PlatformId; value: string; barPercent: number };
export type TopVideo = {
  title: string;
  laneId: LaneId;
  platform: PlatformId;
  views: string;
  revenue: string;
};

// --- Lịch xuất bản ---
export type ScheduleItem = {
  day: number; // index vào WEEK_DAYS
  slot: number; // index vào TIME_SLOTS
  platform: PlatformId;
  title: string;
  laneId: LaneId;
};

/* --- Overview dashboard (Round UI-02) --- */
export type OverviewKpi = Kpi & { spark: number[]; href: string };
export type ClusterSummary = {
  laneId: LaneId;
  name: string;
  channels: number;
  contents: number;
  views: string;
  clicks: string;
  revenue: string;
  platforms: PlatformId[];
};
export type AttentionLevel = 'high' | 'medium' | 'low';
export type AttentionItem = {
  id: string;
  level: AttentionLevel;
  title: string;
  detail: string;
  module: string;
  href: string;
  action: string;
};
export type ContentStatus =
  | 'draft'
  | 'rendering'
  | 'qa-pass'
  | 'pending-approval'
  | 'ready'
  | 'published'
  | 'failed';
export type RecentContent = {
  id: string;
  title: string;
  laneId: LaneId;
  product: string;
  platform: PlatformId;
  status: ContentStatus;
  duration: string;
  href: string;
};
export type ReadinessStatus =
  | 'ready'
  | 'manual-review'
  | 'missing-thumbnail'
  | 'scheduled'
  | 'published';
export type PlatformReadiness = {
  platform: PlatformId;
  status: ReadinessStatus;
  count: number;
  note: string;
};
export type TopProduct = { name: string; laneId: LaneId; clicks: string; revenue: string };
export type PipelineStageStat = { name: string; count: number; href: string; terminal?: boolean };

/* --- Publish command center (Round UI-03A) --- */
export type PublishPlatformStatus =
  | 'READY'
  | 'MANUAL_REVIEW'
  | 'MISSING_THUMBNAIL'
  | 'WAIT_PACKAGE'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'BLOCKED';
export type PlatformPublishState = {
  status: PublishPlatformStatus;
  channel: string;
  packageFile: string | null;
  packageSize: string | null;
  captionReady: boolean;
  thumbnailReady: boolean;
  affiliateLinkReady: boolean;
  scheduledAt: string | null;
};
export type PublishContent = {
  id: string;
  title: string;
  laneId: LaneId;
  product: string;
  productPrice: string;
  affiliateLink: string; // MOCK — vẫn gắn owner để gate kiểm tra
  duration: string;
  format: string;
  // gate chung (content-level)
  qaPassed: boolean;
  approved: boolean; // operator đã duyệt
  ownerValid: boolean; // owner_id Shopee khớp
  captionReady: boolean;
  voiceBgmReady: boolean;
  durationValid: boolean;
  safeAreaOk: boolean;
  platforms: Record<PlatformId, PlatformPublishState>;
};
export type GateItem = { label: string; ok: boolean };
export type ScheduleBucket = 'today' | 'tomorrow' | 'week';
export type SchedulePreviewItem = {
  id: string;
  bucket: ScheduleBucket;
  time: string;
  platform: PlatformId;
  channel: string;
  title: string;
  status: PublishPlatformStatus;
  packageFile: string;
};
export type PublishWarning = {
  id: string;
  level: AttentionLevel;
  title: string;
  detail: string;
  href: string;
  action: string;
};

/* --- QA review command center (Round UI-03B) --- */
export type QaStatus =
  | 'WAIT_QA'
  | 'RUNNING_QA'
  | 'QA_PASS'
  | 'QA_FAIL'
  | 'NEEDS_OPERATOR_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'BLOCKED';
export type OperatorStatus = 'pending' | 'approved' | 'rejected';
export type RiskLevel = 'high' | 'medium' | 'low';
export type CheckState = 'pass' | 'fail' | 'warn';
export type QaCheckItem = { label: string; state: CheckState; note?: string };
export type QaReadinessStatus = 'READY' | 'WARNING' | 'BLOCKED';
export type QaPlatformReadiness = {
  platform: PlatformId;
  packageReady: boolean;
  captionReady: boolean;
  thumbnailReady: boolean;
  safeAreaOk: boolean;
  status: QaReadinessStatus;
};
export type QaFinding = {
  id: string;
  severity: RiskLevel;
  category: 'audio' | 'caption' | 'affiliate' | 'creative' | 'platform' | 'render';
  message: string;
  action: string;
  href: string;
};
export type CheckOverride = Record<string, { state: CheckState; note?: string }>;
export type QaJob = {
  id: string;
  title: string;
  laneId: LaneId;
  product: string;
  productPrice: string;
  affiliateLink: string;
  ownerValid: boolean;
  duration: string;
  targets: PlatformId[];
  qaStatus: QaStatus;
  operatorStatus: OperatorStatus;
  risk: RiskLevel;
  rejectReason?: string;
  voiceStatus: CheckState;
  bgmStatus: CheckState;
  captionStatus: CheckState;
  packageStatus: CheckState;
  techOverrides?: CheckOverride;
  creativeOverrides?: CheckOverride;
  affiliateOverrides?: CheckOverride;
  platforms: QaPlatformReadiness[];
  findings: QaFinding[];
};
