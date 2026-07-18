// Trạng thái phiên đăng nhập lại Douyin — cầu nối giữa 00-douyin-login.ts (ghi)
// và route/UI (đọc để poll auto-resume). Artifact runtime dưới data/temp/
// (gitignored). Hàm thuần, testable; caller stamp thời gian (dễ test tất định).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const DOUYIN_LOGIN_STATUS_REL = 'data/temp/douyin_login_status.json';

export interface DouyinLoginStatus {
  /** OPEN = cửa sổ đang mở chờ Operator; CLOSED = Operator đã đóng (login xong). */
  state: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt: string | null;
  pid: number;
  /** Mốc ghi gần nhất — dùng cho freshness check (chống đọc lần login CŨ). */
  generatedAt: string;
}

export function douyinLoginStatusPath(root: string): string {
  return join(root, DOUYIN_LOGIN_STATUS_REL);
}

function isValidStatus(v: unknown): v is DouyinLoginStatus {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    (s.state === 'OPEN' || s.state === 'CLOSED') &&
    typeof s.openedAt === 'string' &&
    (s.closedAt === null || typeof s.closedAt === 'string') &&
    typeof s.pid === 'number' &&
    typeof s.generatedAt === 'string'
  );
}

/** Ghi status (caller đã stamp thời gian). Tạo thư mục nếu thiếu. */
export function writeDouyinLoginStatus(root: string, status: DouyinLoginStatus): void {
  const p = douyinLoginStatusPath(root);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
}

/** Đọc status; null nếu chưa có / hỏng / sai shape. */
export function readDouyinLoginStatus(root: string): DouyinLoginStatus | null {
  const p = douyinLoginStatusPath(root);
  if (!existsSync(p)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(p, 'utf8'));
    return isValidStatus(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** generatedAt nằm trong maxAgeMs so với now (dung sai -5s lệch đồng hồ). false
 * nếu generatedAt không parse được. Chống UI đọc nhầm artifact lần login trước. */
export function isFreshStatus(status: DouyinLoginStatus, nowMs: number, maxAgeMs: number): boolean {
  const t = Date.parse(status.generatedAt);
  if (Number.isNaN(t)) return false;
  const age = nowMs - t;
  return age <= maxAgeMs && age >= -5_000;
}
