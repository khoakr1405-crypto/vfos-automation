/* =============================================================================
 * VFOS Studio — Facebook Growth OS data model (Round Growth 02)
 * -----------------------------------------------------------------------------
 * PURE types + literal constants. KHÔNG import node:fs / node:path.
 * An toàn để client component import (type-only). Server adapter (load.ts) và
 * smoke test import lại các type + const này.
 *
 * Nguyên tắc data model (Round Growth 02):
 *   - Filesystem JSON, KHÔNG DB.
 *   - TUYỆT ĐỐI không field token/secret/credential. Token sống ở env server-side,
 *     entity chỉ giữ cờ boolean (vd Channel.tokenConfigured).
 *   - Field tối thiểu (YAGNI) — chỉ những gì roadmap Growth 03–09 thực sự cần.
 * ========================================================================== */

export type GrowthDataSource = 'mock' | 'real';

export type Platform = 'facebook' | 'tiktok' | 'youtube';

/* ---- Comment intent taxonomy ---------------------------------------------- */

/** Intent an toàn — đủ điều kiện được Guarded Auto-Reply (L3) chạm tới. */
export const SAFE_AUTO_INTENTS = [
  'ASK_LINK',
  'ASK_PRICE',
  'ASK_WHERE_TO_BUY',
  'ASK_STOCK',
] as const;

/** Intent KHÔNG bao giờ auto — luôn escalate sang operator/hàng chờ. */
export const ESCALATE_INTENTS = [
  'COMPLAINT',
  'NEGATIVE',
  'COMPARE_PRODUCT',
  'MEDICAL_LEGAL_FINANCIAL_CLAIM',
  'ABUSE',
  'SPAM',
  'UNKNOWN',
] as const;

export type SafeAutoIntent = (typeof SAFE_AUTO_INTENTS)[number];
export type EscalateIntent = (typeof ESCALATE_INTENTS)[number];
export type CommentIntentValue = SafeAutoIntent | EscalateIntent;

/* ---- Entities ------------------------------------------------------------- */

/**
 * Kênh Facebook/page vận hành. Credential KHÔNG lưu ở đây — chỉ cờ boolean.
 * Tên field tránh substring "token"/"credential" để no-secret scanner giữ
 * strict mà không cần allowlist ngoại lệ.
 */
export interface Channel {
  channelId: string;
  platform: Platform;
  /** Public page id (vd Facebook page id). KHÔNG phải secret. */
  pageId: string;
  displayName: string;
  lane: string;
  status: 'active' | 'review' | 'paused';
  postingRule: string;
  /** true nếu credential page đã cấu hình server-side (boolean, không chứa giá trị thật). */
  pageAccessConfigured: boolean;
}

/** Góc nội dung kéo view — định hình hook/audience cho batch tương lai. */
export interface ContentAngle {
  angleId: string;
  name: string;
  hook: string;
  audience: string;
  lane: string;
  productAffinity: string[];
  status: 'active' | 'testing' | 'retired';
}

/** Kế hoạch đăng theo kênh + khung giờ. jobId nullable khi mới lên lịch. */
export interface PostingPlan {
  planId: string;
  channelId: string;
  jobId: string | null;
  slotTime: string;
  platform: Platform;
  status: 'planned' | 'posted' | 'skipped';
}

/** Bài đã đăng — neo jobId ↔ facebookPostId (nguồn: facebook_publish_result.json). */
export interface PublishedPost {
  publishedPostId: string;
  jobId: string;
  channelId: string;
  /** Public Facebook post id (vd "<pageId>_<postId>"). KHÔNG phải token. */
  facebookPostId: string;
  videoId: string | null;
  productId: string | null;
  /** Affiliate short link công khai (public attribution). KHÔNG phải secret. */
  affiliateShortLink: string | null;
  publishedAt: string;
}

/** Chỉ số hiệu suất 1 lần chụp cho 1 bài đã đăng. source rõ mock vs real. */
export interface PerformanceMetric {
  metricId: string;
  publishedPostId: string;
  capturedAt: string;
  views: number;
  clicks: number;
  ctr: number;
  reactions: number;
  commentsCount: number;
  shares: number;
  source: GrowthDataSource;
}

/** Một comment thu được. authorRef ẩn danh hoá — KHÔNG lưu PII người thật. */
export interface CommentItem {
  commentId: string;
  publishedPostId: string;
  /** Public Facebook comment id. KHÔNG phải token. */
  fbCommentId: string;
  /** Đã ẩn danh hoá (vd "viewer_a1") — không phải tên/UID thật. */
  authorRef: string;
  text: string;
  createdAt: string;
  status: 'new' | 'classified' | 'handled' | 'escalated';
}

/** Kết quả phân loại intent cho 1 comment. isSafeForAuto = intent ∈ SAFE_AUTO. */
export interface CommentIntent {
  commentId: string;
  intent: CommentIntentValue;
  confidence: number;
  isSafeForAuto: boolean;
}

/** Mẫu reply theo intent. bodyTemplate dùng placeholder {affiliate_link}. */
export interface ReplyTemplate {
  templateId: string;
  intent: CommentIntentValue;
  lane: string;
  bodyTemplate: string;
  requiresLink: boolean;
  tone: string;
}

/** Audit log mọi hành động comment (append-only). KHÔNG token. */
export interface CommentActionLog {
  actionId: string;
  commentId: string;
  action: 'draft' | 'sent' | 'skipped' | 'escalated';
  level: 'L1' | 'L2' | 'L3';
  replyText: string | null;
  /** Link đã dùng khi gửi thật (null nếu chưa gửi). Public link, KHÔNG token. */
  affiliateLinkUsed: string | null;
  operatorRef: string | null;
  createdAt: string;
}

/** Tín hiệu học được từ dữ liệu hiệu suất/comment. refId trỏ entity theo scope. */
export interface LearningSignal {
  signalId: string;
  scope: 'post' | 'angle' | 'channel' | 'product';
  refId: string;
  metric: string;
  delta: number;
  observation: string;
  capturedAt: string;
}

/** Đề xuất cải tiến — CHỈ đề xuất, không tự thực thi. */
export interface GrowthRecommendation {
  recId: string;
  basedOnSignals: string[];
  recommendation: string;
  priority: 'high' | 'medium' | 'low';
  status: 'proposed' | 'accepted' | 'dismissed';
}

/* ---- Aggregate snapshot ---------------------------------------------------- */

export interface GrowthSnapshot {
  source: GrowthDataSource;
  generatedAt: string;
  channels: Channel[];
  contentAngles: ContentAngle[];
  postingPlans: PostingPlan[];
  publishedPosts: PublishedPost[];
  performanceMetrics: PerformanceMetric[];
  commentItems: CommentItem[];
  commentIntents: CommentIntent[];
  replyTemplates: ReplyTemplate[];
  commentActionLog: CommentActionLog[];
  learningSignals: LearningSignal[];
  growthRecommendations: GrowthRecommendation[];
}
