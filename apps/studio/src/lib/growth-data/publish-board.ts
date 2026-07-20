/* =============================================================================
 * VFOS Studio — Publish rhythm BOARD projection (Phần 82 R-C) — SERVER ONLY, READ.
 * -----------------------------------------------------------------------------
 * Đọc THẲNG file board máy tick ghi ra: data/growth/runtime/publish-board.json
 * (gitignored). PURE READ — never-throw, KHÔNG mutate, KHÔNG gọi tick/publish.
 * Panel Tổng quan chỉ hiển thị; mọi hành động đăng là của máy tick (server-side).
 *
 * KHÔNG import scripts/ tree (giữ studio decoupled) — khai báo lại DTO tối giản
 * đúng field máy tick ghi. Thiếu/hỏng file → null → panel hiện "tick chưa chạy".
 * ========================================================================== */

import { existsSync, readFileSync } from 'node:fs';
import { resolveInsideRepo } from '@/lib/studio-data/paths';

const BOARD_REL = 'data/growth/runtime/publish-board.json';

export interface PublishBoardSlotUi {
  slotId: string;
  targetId: string;
  lane: 'review' | 'ent';
  platform: 'tiktok' | 'facebook';
  scheduledAt: string;
  state: 'EMPTY' | 'BOUND' | 'FIRED' | 'SKIPPED';
  jobId?: string;
  firedAt?: string;
  skippedAt?: string;
  result?: { postId?: string; shareUrl?: string; permalinkUrl?: string; videoId?: string };
  error?: { code: string; message: string };
}

export interface PublishBoardUi {
  generatedAt: string;
  lastTickAt: string;
  halted: boolean;
  config: { master: boolean; liveTiktok: boolean; liveFacebook: boolean; dryRun: boolean };
  targets: Array<{ targetId: string; lane: string; platform: string }>;
  upcoming: PublishBoardSlotUi[];
  recent: PublishBoardSlotUi[];
  operatorTodos: string[];
  /** Số phút kể từ lastTickAt (null nếu không có mốc) — panel cảnh báo tick treo. */
  staleMinutes: number | null;
}

/** Đọc board (read-only). null nếu chưa có/hỏng file (tick chưa chạy lần nào). */
export function readPublishBoardForUi(nowMs: number = Date.now()): PublishBoardUi | null {
  const p = resolveInsideRepo(BOARD_REL);
  if (!p || !existsSync(p)) return null;
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8')) as Partial<PublishBoardUi> & {
      lastTickAt?: string;
    };
    if (!parsed || typeof parsed !== 'object') return null;
    const lastTickAt = typeof parsed.lastTickAt === 'string' ? parsed.lastTickAt : '';
    const lastMs = lastTickAt ? Date.parse(lastTickAt) : Number.NaN;
    const staleMinutes = Number.isFinite(lastMs)
      ? Math.max(0, Math.round((nowMs - lastMs) / 60000))
      : null;
    return {
      generatedAt: typeof parsed.generatedAt === 'string' ? parsed.generatedAt : '',
      lastTickAt,
      halted: parsed.halted === true,
      config: {
        master: parsed.config?.master === true,
        liveTiktok: parsed.config?.liveTiktok === true,
        liveFacebook: parsed.config?.liveFacebook === true,
        dryRun: parsed.config?.dryRun !== false,
      },
      targets: Array.isArray(parsed.targets) ? parsed.targets : [],
      upcoming: Array.isArray(parsed.upcoming) ? parsed.upcoming : [],
      recent: Array.isArray(parsed.recent) ? parsed.recent : [],
      operatorTodos: Array.isArray(parsed.operatorTodos) ? parsed.operatorTodos : [],
      staleMinutes,
    };
  } catch {
    return null;
  }
}
