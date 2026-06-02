/* =============================================================================
 * ⚠️  MOCK DATA — KHÔNG PHẢI DỮ LIỆU THẬT
 * -----------------------------------------------------------------------------
 * Round UI-01: đây là UI shell. Toàn bộ số liệu, sản phẩm, link, job, lịch
 * trong file này là MOCK tĩnh phục vụ dựng giao diện.
 *   - KHÔNG gọi Shopee / TopView / Facebook / TikTok / YouTube API.
 *   - KHÔNG chạm pipeline backend / production.
 *   - Mọi affiliate link là giả lập (dù vẫn gắn owner để giữ đúng rule VFOS).
 * Khi nối backend thật ở round sau, thay nguồn dữ liệu này — UI giữ nguyên.
 * ========================================================================== */

import type { AccentKey } from './nav';

/** Affiliate owner bắt buộc của VFOS (Shopee). Mismatch = fail-safe. */
export const SHOPEE_OWNER = 'an_17376660568';

export const DATA_SOURCE = 'mock' as const;

// ---------------------------------------------------------------------------
// Ngách / Lane — phản ánh đúng 3 lane VFOS
// ---------------------------------------------------------------------------
export type LaneId = 'review' | 'cau-ca' | 'rua-xe';

export type Lane = {
  id: LaneId;
  label: string;
  accent: AccentKey;
};

export const LANES: Lane[] = [
  { id: 'review', label: 'Review Sản Phẩm', accent: 'blue' },
  { id: 'cau-ca', label: 'Câu Cá', accent: 'cyan' },
  { id: 'rua-xe', label: 'Rửa Xe & Đồ Chơi Xe', accent: 'amber' },
];

export const LANE_LABEL: Record<LaneId, string> = Object.fromEntries(
  LANES.map((l) => [l.id, l.label]),
) as Record<LaneId, string>;

// ---------------------------------------------------------------------------
// Nền tảng — đúng 3 nền tảng VFOS
// ---------------------------------------------------------------------------
export type PlatformId = 'facebook' | 'tiktok' | 'youtube';

export type Platform = {
  id: PlatformId;
  label: string;
  accent: AccentKey;
};

export const PLATFORMS: Platform[] = [
  { id: 'facebook', label: 'Facebook Reels', accent: 'blue' },
  { id: 'tiktok', label: 'TikTok', accent: 'cyan' },
  { id: 'youtube', label: 'YouTube Shorts', accent: 'rose' },
];

export const PLATFORM_LABEL: Record<PlatformId, string> = Object.fromEntries(
  PLATFORMS.map((p) => [p.id, p.label]),
) as Record<PlatformId, string>;

// ---------------------------------------------------------------------------
// Tổng quan — KPI
// ---------------------------------------------------------------------------
export type Kpi = {
  label: string;
  value: string;
  delta?: string;
  trend?: 'up' | 'down' | 'flat';
  accent: AccentKey;
};

export const OVERVIEW_KPIS: Kpi[] = [
  { label: 'Job đang chạy', value: '28', delta: '+6 hôm nay', trend: 'up', accent: 'blue' },
  { label: 'Nội dung hôm nay', value: '56', delta: '+12%', trend: 'up', accent: 'violet' },
  { label: 'Video đã xuất', value: '42', delta: '+8', trend: 'up', accent: 'cyan' },
  {
    label: 'Doanh thu ước tính',
    value: '₫68.540.000',
    delta: '+9.4%',
    trend: 'up',
    accent: 'green',
  },
];

export const FUNNEL_KPIS: Kpi[] = [
  { label: 'Lượt xem', value: '1.25M', delta: '+32%', trend: 'up', accent: 'blue' },
  { label: 'Lượt click', value: '72.4K', delta: '+0.71%', trend: 'up', accent: 'violet' },
  { label: 'CTR', value: '4.12%', delta: '+0.27%', trend: 'up', accent: 'cyan' },
  { label: 'Tỷ lệ QA PASS', value: '92.6%', delta: '+1.4%', trend: 'up', accent: 'green' },
];

// ---------------------------------------------------------------------------
// Cụm kênh & Kênh
// ---------------------------------------------------------------------------
export type ChannelRow = {
  platform: PlatformId;
  views: string;
  ctr: string;
  revenue: string;
  status: 'active' | 'review' | 'paused';
};

export type ChannelCluster = {
  laneId: LaneId;
  name: string;
  channels: ChannelRow[];
};

export const CHANNEL_CLUSTERS: ChannelCluster[] = [
  {
    laneId: 'review',
    name: 'Cụm Review Sản Phẩm',
    channels: [
      { platform: 'facebook', views: '420K', ctr: '4.21%', revenue: '₫32.4M', status: 'active' },
      { platform: 'tiktok', views: '582K', ctr: '4.21%', revenue: '₫22.1M', status: 'active' },
      { platform: 'youtube', views: '582K', ctr: '4.81%', revenue: '₫18.7M', status: 'active' },
    ],
  },
  {
    laneId: 'cau-ca',
    name: 'Cụm Câu Cá',
    channels: [
      { platform: 'facebook', views: '132K', ctr: '4.81%', revenue: '₫18.7M', status: 'active' },
      { platform: 'tiktok', views: '210K', ctr: '3.92%', revenue: '₫12.9M', status: 'review' },
      { platform: 'youtube', views: '320K', ctr: '4.81%', revenue: '₫18.7M', status: 'active' },
    ],
  },
  {
    laneId: 'rua-xe',
    name: 'Cụm Rửa Xe & Đồ Chơi Xe',
    channels: [
      { platform: 'facebook', views: '210K', ctr: '3.92%', revenue: '₫12.9M', status: 'active' },
      { platform: 'tiktok', views: '210K', ctr: '3.92%', revenue: '₫12.9M', status: 'active' },
      { platform: 'youtube', views: '128K', ctr: '3.92%', revenue: '₫12.9M', status: 'paused' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Sản phẩm & Link affiliate  (link MOCK — vẫn gắn owner để giữ rule VFOS)
// ---------------------------------------------------------------------------
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

const mockAffiliate = (sku: string) => `https://shp.ee/${sku}?aff=${SHOPEE_OWNER}`;

export const PRODUCTS: Product[] = [
  {
    id: 'P-1001',
    name: 'Máy rửa xe mini Zukul',
    price: '₫699.000',
    laneId: 'rua-xe',
    affiliateLink: mockAffiliate('zukul699'),
    status: 'active',
  },
  {
    id: 'P-1002',
    name: 'Cần câu Carbon 2m1',
    price: '₫159.000',
    laneId: 'cau-ca',
    affiliateLink: mockAffiliate('carbon21'),
    status: 'active',
  },
  {
    id: 'P-1003',
    name: 'Máy xay sinh tố mini',
    price: '₫249.000',
    laneId: 'review',
    affiliateLink: mockAffiliate('blend249'),
    status: 'active',
  },
  {
    id: 'P-1004',
    name: 'Bộ rửa xe bọt tuyết',
    price: '₫179.000',
    laneId: 'rua-xe',
    affiliateLink: mockAffiliate('foam179'),
    status: 'active',
  },
  {
    id: 'P-1005',
    name: 'Hộp đồ câu đa năng',
    price: '₫89.000',
    laneId: 'cau-ca',
    affiliateLink: mockAffiliate('box89'),
    status: 'active',
  },
  {
    id: 'P-1006',
    name: 'Máy hút bụi cầm tay',
    price: '₫349.000',
    laneId: 'review',
    affiliateLink: mockAffiliate('vac349'),
    status: 'out-of-stock',
  },
  {
    id: 'P-1007',
    name: 'Nước rửa xe bọt tuyết',
    price: '₫120.000',
    laneId: 'rua-xe',
    affiliateLink: mockAffiliate('soap120'),
    status: 'active',
  },
];

// ---------------------------------------------------------------------------
// Pipeline / Job — Tạo nội dung mới + hàng đợi
// ---------------------------------------------------------------------------
export const PIPELINE_STAGES = [
  'Nguồn',
  'Raw Visual',
  'Script',
  'Voice',
  'BGM',
  'Render',
  'Caption',
  'QA',
  'Publish',
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

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

export const JOBS: Job[] = [
  {
    id: 'JOB-2401',
    title: 'Máy rửa xe Zukul — demo 5 phút',
    laneId: 'rua-xe',
    productId: 'P-1001',
    platform: 'facebook',
    stageIndex: 7,
    status: 'manual',
    updatedAt: '2 phút trước',
  },
  {
    id: 'JOB-2402',
    title: 'Cần câu Carbon 2m1 — unbox',
    laneId: 'cau-ca',
    productId: 'P-1002',
    platform: 'tiktok',
    stageIndex: 5,
    status: 'running',
    updatedAt: '6 phút trước',
  },
  {
    id: 'JOB-2403',
    title: 'Máy xay sinh tố mini — review',
    laneId: 'review',
    productId: 'P-1003',
    platform: 'youtube',
    stageIndex: 8,
    status: 'waiting',
    updatedAt: '11 phút trước',
  },
  {
    id: 'JOB-2404',
    title: 'Bộ rửa xe bọt tuyết — before/after',
    laneId: 'rua-xe',
    productId: 'P-1004',
    platform: 'facebook',
    stageIndex: 2,
    status: 'running',
    updatedAt: '14 phút trước',
  },
  {
    id: 'JOB-2405',
    title: 'Hộp đồ câu đa năng — top 5',
    laneId: 'cau-ca',
    productId: 'P-1005',
    platform: 'tiktok',
    stageIndex: 3,
    status: 'blocked',
    updatedAt: '23 phút trước',
  },
  {
    id: 'JOB-2406',
    title: 'Máy hút bụi cầm tay — mini test',
    laneId: 'review',
    productId: 'P-1006',
    platform: 'youtube',
    stageIndex: 6,
    status: 'running',
    updatedAt: '31 phút trước',
  },
];

// ---------------------------------------------------------------------------
// Raw Visual AI — video raw đã tạo (MOCK, không có file thật trong repo)
// ---------------------------------------------------------------------------
export type RawVisual = {
  id: string;
  file: string;
  duration: string;
  ratio: string;
  status: 'ready' | 'processing' | 'rejected';
  engine: string;
};

export const RAW_VISUALS: RawVisual[] = [
  {
    id: 'RV-001',
    file: 'raw_zukul_001.mp4',
    duration: '00:15',
    ratio: '9:16',
    status: 'ready',
    engine: 'TopView (mock)',
  },
  {
    id: 'RV-002',
    file: 'raw_zukul_002.mp4',
    duration: '00:19',
    ratio: '9:16',
    status: 'ready',
    engine: 'TopView (mock)',
  },
  {
    id: 'RV-003',
    file: 'raw_zukul_003.mp4',
    duration: '00:17',
    ratio: '9:16',
    status: 'processing',
    engine: 'Runway (mock)',
  },
];

export const RAW_VISUAL_ENGINES = ['TopView', 'Kling AI', 'Runway', 'Pika', 'Luma', 'Upload'];

// ---------------------------------------------------------------------------
// Script / Voice / BGM
// ---------------------------------------------------------------------------
export const SAMPLE_SCRIPT = `Máy rửa xe mini Zukul á...
- Nhỏ gọn, bỏ vừa cốp xe, đỡ vướng víu.
- Bật lên là có nước, tiện thật sự đấy.
- Pin dùng được kha khá, đi xa cũng đỡ lo.
- Rửa xe, tưới cây, xịt sàn... một em lo hết.
- Sản phẩm mình để dưới phần bình luận nhé!`;

export type VoiceSetting = { label: string; value: string };
export const VOICE_SETTINGS: VoiceSetting[] = [
  { label: 'Giọng đọc', value: 'VFOS Brand Voice (nữ, trẻ trung)' },
  { label: 'Tốc độ', value: '1.3×' },
  { label: 'Năng lượng', value: 'Vừa' },
  { label: 'Cảm xúc', value: 'Tự nhiên' },
  { label: 'Model', value: 'eleven_v3 (mock)' },
];

export type BgmTrack = {
  id: string;
  name: string;
  mood: string;
  uses: number;
  selected?: boolean;
};

// Thư viện 20 bài xoay vòng — ưu tiên bài ít dùng (uses thấp). Subset hiển thị.
export const BGM_LIBRARY: BgmTrack[] = [
  {
    id: 'BGM_014',
    name: 'BGM_014_Energetic',
    mood: 'Vui tươi / quảng cáo',
    uses: 3,
    selected: true,
  },
  { id: 'BGM_007', name: 'BGM_007_LightPiano', mood: 'Nhẹ nhàng / ấm áp', uses: 5 },
  { id: 'BGM_011', name: 'BGM_011_UpbeatPop', mood: 'Sôi động', uses: 8 },
  { id: 'BGM_019', name: 'BGM_019_ChillLofi', mood: 'Thư giãn', uses: 2 },
  { id: 'BGM_003', name: 'BGM_003_Corporate', mood: 'Chuyên nghiệp', uses: 12 },
];

export const BGM_RULES = [
  'BGM dẫn mood — Voice là chính.',
  'Voice phải rõ lời — BGM không lấn voice.',
  'Âm lượng BGM ≤ −18 LUFS.',
];

// ---------------------------------------------------------------------------
// Render & Caption
// ---------------------------------------------------------------------------
export type RenderSetting = { label: string; value: string };
export const RENDER_SETTINGS: RenderSetting[] = [
  { label: 'Định dạng', value: '9:16 (1080×1920)' },
  { label: 'FPS', value: '30' },
  { label: 'Chất lượng', value: 'High' },
  { label: 'Phụ đề', value: 'Bật' },
  { label: 'Kiểu chữ', value: 'Bold — Viền đen' },
  { label: 'Vị trí chữ', value: 'Giữa — Dưới' },
  { label: 'Safe area', value: 'Bật (TikTok / Reels)' },
];

// ---------------------------------------------------------------------------
// QA & Duyệt — checklist bắt buộc trước khi duyệt
// ---------------------------------------------------------------------------
export type QaCheck = { label: string; status: 'pass' | 'fail' | 'warn' };
export const QA_CHECKLIST: QaCheck[] = [
  { label: 'Audio tồn tại', status: 'pass' },
  { label: 'Voice rõ lời', status: 'pass' },
  { label: 'BGM không lấn voice', status: 'pass' },
  { label: 'Caption tồn tại', status: 'pass' },
  { label: 'Duration hợp lệ (15s – 60s)', status: 'pass' },
  { label: 'Link affiliate hợp lệ', status: 'pass' },
  { label: 'Visual đúng sản phẩm', status: 'pass' },
  { label: 'Không watermark', status: 'pass' },
  { label: 'Safe area 9:16 OK', status: 'pass' },
];

export type QaQueueItem = {
  jobId: string;
  title: string;
  laneId: LaneId;
  platform: PlatformId;
  result: 'pass' | 'pending' | 'fail';
};
export const QA_QUEUE: QaQueueItem[] = [
  {
    jobId: 'JOB-2401',
    title: 'Máy rửa xe Zukul — demo 5 phút',
    laneId: 'rua-xe',
    platform: 'facebook',
    result: 'pending',
  },
  {
    jobId: 'JOB-2403',
    title: 'Máy xay sinh tố mini — review',
    laneId: 'review',
    platform: 'youtube',
    result: 'pass',
  },
  {
    jobId: 'JOB-2402',
    title: 'Cần câu Carbon 2m1 — unbox',
    laneId: 'cau-ca',
    platform: 'tiktok',
    result: 'pending',
  },
];

// ---------------------------------------------------------------------------
// Xuất bản & Lịch — publish từng nền tảng riêng, KHÔNG auto
// ---------------------------------------------------------------------------
export type PublishRow = {
  jobId: string;
  platform: PlatformId;
  channel: string;
  status: 'ready' | 'manual-review' | 'wait-thumbnail' | 'approved';
  scheduledAt: string;
};
export const PUBLISH_MATRIX: PublishRow[] = [
  {
    jobId: 'JOB-2401',
    platform: 'facebook',
    channel: 'Rửa Xe Tiện Ích',
    status: 'ready',
    scheduledAt: '18:00 · 06/01',
  },
  {
    jobId: 'JOB-2405',
    platform: 'tiktok',
    channel: 'Đồ Chơi Xe Hay',
    status: 'manual-review',
    scheduledAt: '20:00 · 06/01',
  },
  {
    jobId: 'JOB-2403',
    platform: 'youtube',
    channel: 'Phụ Kiện Ô Tô',
    status: 'wait-thumbnail',
    scheduledAt: '22:00 · 06/01',
  },
];

export type PublishPackage = { platform: PlatformId; file: string; size: string };
export const PUBLISH_PACKAGES: PublishPackage[] = [
  { platform: 'facebook', file: 'facebook_reels_001_9x16.zip', size: '95.2 MB' },
  { platform: 'tiktok', file: 'tiktok_001_9x16.zip', size: '92.1 MB' },
  { platform: 'youtube', file: 'shorts_001_9x16.zip', size: '93.7 MB' },
];

// ---------------------------------------------------------------------------
// Hiệu suất / Analytics
// ---------------------------------------------------------------------------
export type RevenueShare = { laneId: LaneId; percent: number };
export const REVENUE_BY_LANE: RevenueShare[] = [
  { laneId: 'review', percent: 49 },
  { laneId: 'cau-ca', percent: 32 },
  { laneId: 'rua-xe', percent: 19 },
];

export type PlatformRevenue = { platform: PlatformId; value: string; barPercent: number };
export const REVENUE_BY_PLATFORM: PlatformRevenue[] = [
  { platform: 'facebook', value: '₫31.2M', barPercent: 100 },
  { platform: 'tiktok', value: '₫22.6M', barPercent: 72 },
  { platform: 'youtube', value: '₫14.7M', barPercent: 47 },
];

export type TopVideo = {
  title: string;
  laneId: LaneId;
  platform: PlatformId;
  views: string;
  revenue: string;
};
export const TOP_VIDEOS: TopVideo[] = [
  {
    title: 'Máy rửa xe mini Zukul',
    laneId: 'rua-xe',
    platform: 'tiktok',
    views: '182K',
    revenue: '₫12.8M',
  },
  {
    title: 'Cần câu Carbon 2m1',
    laneId: 'cau-ca',
    platform: 'youtube',
    views: '128K',
    revenue: '₫8.45M',
  },
  {
    title: 'Bộ rửa xe bọt tuyết',
    laneId: 'rua-xe',
    platform: 'facebook',
    views: '112K',
    revenue: '₫7.21M',
  },
  {
    title: 'Máy xay sinh tố mini',
    laneId: 'review',
    platform: 'tiktok',
    views: '98K',
    revenue: '₫6.10M',
  },
];

// ---------------------------------------------------------------------------
// Lịch xuất bản đa nền tảng (module 11)
// ---------------------------------------------------------------------------
export const WEEK_DAYS = [
  'T2 26/05',
  'T3 27/05',
  'T4 28/05',
  'T5 29/05',
  'T6 30/05',
  'T7 31/05',
  'CN 01/06',
];
export const TIME_SLOTS = ['18:00', '19:00', '20:00', '21:00', '22:00'];

export type ScheduleItem = {
  day: number; // index vào WEEK_DAYS
  slot: number; // index vào TIME_SLOTS
  platform: PlatformId;
  title: string;
  laneId: LaneId;
};
export const SCHEDULE_ITEMS: ScheduleItem[] = [
  { day: 0, slot: 0, platform: 'facebook', title: 'Máy rửa xe mini Zukul', laneId: 'rua-xe' },
  { day: 1, slot: 1, platform: 'tiktok', title: 'Cần câu Carbon 2m1', laneId: 'cau-ca' },
  { day: 2, slot: 2, platform: 'youtube', title: 'Bộ rửa xe bọt tuyết', laneId: 'rua-xe' },
  { day: 3, slot: 1, platform: 'facebook', title: 'Mẹo rửa xe sạch', laneId: 'rua-xe' },
  { day: 4, slot: 3, platform: 'tiktok', title: 'Máy xay sinh tố mini', laneId: 'review' },
  { day: 5, slot: 2, platform: 'tiktok', title: 'Máy xay sinh tố mini', laneId: 'review' },
  { day: 6, slot: 3, platform: 'youtube', title: 'Phụ kiện ô tô giá rẻ', laneId: 'rua-xe' },
];

// ---------------------------------------------------------------------------
// Rule VFOS hiển thị xuyên suốt UI
// ---------------------------------------------------------------------------
export const VFOS_RULES = [
  'Mục tiêu cuối là gắn link affiliate vào mọi nội dung.',
  'BGM dẫn mood — Voice là chính.',
  'QA bắt buộc PASS trước khi duyệt.',
  'Operator duyệt thủ công trước khi publish.',
  'Publish từng nền tảng riêng — KHÔNG publish tự động.',
];

/* =============================================================================
 * OVERVIEW DASHBOARD (Round UI-02)
 * Dữ liệu chuyên cho page Tổng quan "/". Vẫn là MOCK tĩnh.
 * ========================================================================== */

// A. KPI Summary — 6 KPI chính + sparkline 7 ngày + link sang module sâu.
export type OverviewKpi = Kpi & { spark: number[]; href: string };

export const OVERVIEW_DASHBOARD_KPIS: OverviewKpi[] = [
  {
    label: 'Job đang chạy',
    value: '28',
    delta: '+6 hôm nay',
    trend: 'up',
    accent: 'blue',
    href: '/create',
    spark: [12, 15, 14, 19, 17, 22, 28],
  },
  {
    label: 'Nội dung đã tạo',
    value: '56',
    delta: '+12%',
    trend: 'up',
    accent: 'violet',
    href: '/create',
    spark: [30, 34, 38, 41, 47, 52, 56],
  },
  {
    label: 'Video đã xuất bản',
    value: '42',
    delta: '+8 hôm nay',
    trend: 'up',
    accent: 'cyan',
    href: '/publish',
    spark: [20, 24, 27, 30, 34, 38, 42],
  },
  {
    label: 'Lượt xem tổng',
    value: '1.25M',
    delta: '+32%',
    trend: 'up',
    accent: 'green',
    href: '/analytics',
    spark: [142, 168, 155, 190, 176, 210, 232],
  },
  {
    label: 'Doanh thu ước tính',
    value: '₫68.5M',
    delta: '+9.4%',
    trend: 'up',
    accent: 'green',
    href: '/analytics',
    spark: [38, 44, 49, 52, 58, 63, 68],
  },
  {
    label: 'CTR (tỷ lệ click)',
    value: '4.12%',
    delta: '+0.27%',
    trend: 'up',
    accent: 'amber',
    href: '/analytics',
    spark: [3.5, 3.7, 3.6, 3.9, 4.0, 4.05, 4.12],
  },
];

// B. Cụm kênh hiệu quả — tóm tắt theo ngách (số kênh/nội dung/view/click/doanh thu).
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

export const CLUSTER_SUMMARIES: ClusterSummary[] = [
  {
    laneId: 'review',
    name: 'Review Sản Phẩm',
    channels: 3,
    contents: 24,
    views: '1.58M',
    clicks: '38.2K',
    revenue: '₫33.6M',
    platforms: ['facebook', 'tiktok', 'youtube'],
  },
  {
    laneId: 'cau-ca',
    name: 'Câu Cá',
    channels: 3,
    contents: 16,
    views: '662K',
    clicks: '19.4K',
    revenue: '₫21.9M',
    platforms: ['facebook', 'tiktok', 'youtube'],
  },
  {
    laneId: 'rua-xe',
    name: 'Rửa Xe & Đồ Chơi Xe',
    channels: 3,
    contents: 18,
    views: '548K',
    clicks: '14.8K',
    revenue: '₫13.0M',
    platforms: ['facebook', 'tiktok', 'youtube'],
  },
];

// C. Danh sách việc cần chú ý — alert theo mức độ + module + hành động + link.
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

export const ATTENTION_ITEMS: AttentionItem[] = [
  {
    id: 'A1',
    level: 'high',
    title: '3 job chờ operator duyệt',
    detail: 'Đã QA PASS, đang chờ duyệt thủ công trước khi publish.',
    module: 'QA & Duyệt',
    href: '/qa',
    action: 'Duyệt ngay',
  },
  {
    id: 'A2',
    level: 'high',
    title: 'TikTok cần manual review',
    detail: 'JOB-2405 · Đồ Chơi Xe Hay cần kiểm tra thủ công trước khi đăng.',
    module: 'Xuất bản',
    href: '/publish',
    action: 'Mở publish',
  },
  {
    id: 'A3',
    level: 'medium',
    title: 'YouTube Shorts thiếu thumbnail',
    detail: 'JOB-2403 · Phụ Kiện Ô Tô chưa gắn thumbnail.',
    module: 'Render & Caption',
    href: '/render',
    action: 'Thêm thumbnail',
  },
  {
    id: 'A4',
    level: 'medium',
    title: '2 link affiliate cần kiểm tra owner',
    detail: `Xác minh owner_id ${SHOPEE_OWNER} trước khi xuất bản.`,
    module: 'Sản phẩm & Link',
    href: '/products',
    action: 'Kiểm tra link',
  },
  {
    id: 'A5',
    level: 'low',
    title: '1 raw visual chưa audit',
    detail: 'raw_zukul_003.mp4 đang xử lý, chờ audit chất lượng.',
    module: 'Raw Visual AI',
    href: '/raw-visual',
    action: 'Xem raw',
  },
  {
    id: 'A6',
    level: 'low',
    title: 'QA cảnh báo caption',
    detail: '1 video caption tràn safe-area, cần kiểm tra lại.',
    module: 'QA & Duyệt',
    href: '/qa',
    action: 'Mở QA',
  },
];

// D. Job/Nội dung gần đây — bao phủ đủ các trạng thái + 3 lane + 3 nền tảng.
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

export const RECENT_CONTENTS: RecentContent[] = [
  {
    id: 'JOB-2401',
    title: 'Máy rửa xe Zukul — demo 5 phút',
    laneId: 'rua-xe',
    product: 'Máy rửa xe mini Zukul',
    platform: 'facebook',
    status: 'pending-approval',
    duration: '00:15',
    href: '/qa',
  },
  {
    id: 'JOB-2402',
    title: 'Cần câu Carbon 2m1 — unbox',
    laneId: 'cau-ca',
    product: 'Cần câu Carbon 2m1',
    platform: 'tiktok',
    status: 'rendering',
    duration: '00:28',
    href: '/render',
  },
  {
    id: 'JOB-2403',
    title: 'Máy xay sinh tố mini — review',
    laneId: 'review',
    product: 'Máy xay sinh tố mini',
    platform: 'youtube',
    status: 'qa-pass',
    duration: '00:42',
    href: '/qa',
  },
  {
    id: 'JOB-2404',
    title: 'Bộ rửa xe bọt tuyết — before/after',
    laneId: 'rua-xe',
    product: 'Bộ rửa xe bọt tuyết',
    platform: 'facebook',
    status: 'ready',
    duration: '00:19',
    href: '/publish',
  },
  {
    id: 'JOB-2405',
    title: 'Hộp đồ câu đa năng — top 5',
    laneId: 'cau-ca',
    product: 'Hộp đồ câu đa năng',
    platform: 'tiktok',
    status: 'failed',
    duration: '00:33',
    href: '/qa',
  },
  {
    id: 'JOB-2406',
    title: 'Máy hút bụi cầm tay — mini test',
    laneId: 'review',
    product: 'Máy hút bụi cầm tay',
    platform: 'youtube',
    status: 'draft',
    duration: '00:24',
    href: '/create',
  },
  {
    id: 'JOB-2399',
    title: 'Mẹo rửa xe sạch như mới',
    laneId: 'rua-xe',
    product: 'Nước rửa xe bọt tuyết',
    platform: 'tiktok',
    status: 'published',
    duration: '00:21',
    href: '/analytics',
  },
];

// E. Publish Readiness Matrix nhỏ — trạng thái sẵn sàng theo nền tảng.
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

export const PUBLISH_READINESS: PlatformReadiness[] = [
  { platform: 'facebook', status: 'ready', count: 3, note: '3 video đã duyệt, sẵn sàng publish' },
  { platform: 'tiktok', status: 'manual-review', count: 1, note: '1 video cần manual review' },
  {
    platform: 'youtube',
    status: 'missing-thumbnail',
    count: 1,
    note: '1 video còn thiếu thumbnail',
  },
];

// F. Mini Analytics — 7 ngày + top nội dung + top sản phẩm (revenue theo cụm tái dùng REVENUE_BY_LANE).
export const SEVEN_DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
export const SEVEN_DAY_VIEWS = [142, 168, 155, 190, 176, 210, 232]; // nghìn view/ngày

export type TopProduct = {
  name: string;
  laneId: LaneId;
  clicks: string;
  revenue: string;
};

export const TOP_PRODUCTS: TopProduct[] = [
  { name: 'Máy rửa xe mini Zukul', laneId: 'rua-xe', clicks: '12.4K', revenue: '₫12.8M' },
  { name: 'Cần câu Carbon 2m1', laneId: 'cau-ca', clicks: '8.1K', revenue: '₫8.45M' },
  { name: 'Máy xay sinh tố mini', laneId: 'review', clicks: '6.7K', revenue: '₫6.10M' },
];

// G. Pipeline Overview — 10 stage + số job mỗi stage để lộ bottleneck.
// 'Published' là stage đầu ra (terminal), không tính vào bottleneck WIP.
export type PipelineStageStat = {
  name: string;
  count: number;
  href: string;
  terminal?: boolean;
};

export const OVERVIEW_PIPELINE: PipelineStageStat[] = [
  { name: 'Raw Visual', count: 5, href: '/raw-visual' },
  { name: 'Vision AI', count: 3, href: '/raw-visual' },
  { name: 'Script', count: 6, href: '/script' },
  { name: 'Voice & BGM', count: 4, href: '/script' },
  { name: 'Render', count: 7, href: '/render' },
  { name: 'Caption', count: 2, href: '/render' },
  { name: 'QA', count: 8, href: '/qa' },
  { name: 'Duyệt', count: 3, href: '/qa' },
  { name: 'Package', count: 2, href: '/publish' },
  { name: 'Published', count: 42, href: '/publish', terminal: true },
];
