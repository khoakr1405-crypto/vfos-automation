import {
  LANES,
  LANE_LABEL,
  type LaneId,
  PLATFORMS,
  PLATFORM_LABEL,
  type PlatformId,
} from '@/lib/mock-data';
import { ACCENT_BG_SOFT, type AccentKey } from '@/lib/nav';
import type { ReactNode } from 'react';

type BadgeProps = {
  children: ReactNode;
  accent?: AccentKey;
  className?: string;
};

export function Badge({ children, accent = 'blue', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${ACCENT_BG_SOFT[accent]} ${className}`}
    >
      {children}
    </span>
  );
}

const laneAccent = (id: LaneId): AccentKey => LANES.find((l) => l.id === id)?.accent ?? 'blue';
const platformAccent = (id: PlatformId): AccentKey =>
  PLATFORMS.find((p) => p.id === id)?.accent ?? 'blue';

export function LanePill({ laneId }: { laneId: LaneId }) {
  return <Badge accent={laneAccent(laneId)}>{LANE_LABEL[laneId]}</Badge>;
}

export function PlatformPill({ platform }: { platform: PlatformId }) {
  return (
    <Badge accent={platformAccent(platform)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {PLATFORM_LABEL[platform]}
    </Badge>
  );
}

const STATUS_MAP: Record<string, { label: string; accent: AccentKey }> = {
  // jobs
  running: { label: 'Đang chạy', accent: 'blue' },
  waiting: { label: 'Chờ', accent: 'amber' },
  manual: { label: 'Cần thao tác', accent: 'amber' },
  blocked: { label: 'Bị chặn', accent: 'rose' },
  done: { label: 'Hoàn tất', accent: 'green' },
  // channels
  active: { label: 'Hoạt động', accent: 'green' },
  review: { label: 'Đang review', accent: 'amber' },
  paused: { label: 'Tạm dừng', accent: 'rose' },
  // products
  'out-of-stock': { label: 'Hết hàng', accent: 'rose' },
  // qa
  pass: { label: 'PASS', accent: 'green' },
  pending: { label: 'Chờ QA', accent: 'amber' },
  fail: { label: 'FAIL', accent: 'rose' },
  warn: { label: 'Cảnh báo', accent: 'amber' },
  // publish
  ready: { label: 'Sẵn sàng', accent: 'green' },
  'manual-review': { label: 'Manual review', accent: 'amber' },
  'wait-thumbnail': { label: 'Chờ thumbnail', accent: 'amber' },
  approved: { label: 'Đã duyệt', accent: 'green' },
  // raw visual
  processing: { label: 'Đang xử lý', accent: 'blue' },
  rejected: { label: 'Loại', accent: 'rose' },
  // content lifecycle (overview)
  draft: { label: 'Draft', accent: 'cyan' },
  rendering: { label: 'Rendering', accent: 'blue' },
  'qa-pass': { label: 'QA PASS', accent: 'green' },
  'pending-approval': { label: 'Chờ duyệt', accent: 'amber' },
  published: { label: 'Published', accent: 'green' },
  failed: { label: 'Failed', accent: 'rose' },
  // publish readiness (overview)
  'missing-thumbnail': { label: 'Thiếu thumbnail', accent: 'amber' },
  scheduled: { label: 'Đã lên lịch', accent: 'blue' },
};

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_MAP[status] ?? { label: status, accent: 'blue' as AccentKey };
  return <Badge accent={meta.accent}>{meta.label}</Badge>;
}

// Publish command center — trạng thái uppercase theo nền tảng (Round UI-03A).
const PUBLISH_STATUS_META: Record<string, { label: string; accent: AccentKey }> = {
  READY: { label: 'Ready', accent: 'green' },
  MANUAL_REVIEW: { label: 'Manual review', accent: 'amber' },
  MISSING_THUMBNAIL: { label: 'Thiếu thumbnail', accent: 'amber' },
  WAIT_PACKAGE: { label: 'Chờ package', accent: 'rose' },
  SCHEDULED: { label: 'Đã lên lịch', accent: 'blue' },
  PUBLISHED: { label: 'Published', accent: 'green' },
  BLOCKED: { label: 'Blocked', accent: 'rose' },
};

export function PublishStatusBadge({ status }: { status: string }) {
  const meta = PUBLISH_STATUS_META[status] ?? { label: status, accent: 'blue' as AccentKey };
  return <Badge accent={meta.accent}>{meta.label}</Badge>;
}
