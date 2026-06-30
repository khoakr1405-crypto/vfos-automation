/* =============================================================================
 * VFOS Studio — Entertainment lane CHANNEL registry (multi-channel R1) — SERVER ONLY
 * -----------------------------------------------------------------------------
 * Đọc config/entertainment_channels.json (metadata, KHÔNG secret). Mỗi kênh =
 * 1 thương hiệu nội dung, bind 1:1 với 1 TikTok account (accountId). channelId/
 * accountId là khoá bind BẤT BIẾN của job — nền chống đăng nhầm kênh.
 * Token KHÔNG ở đây (xem lib/tiktok/account-store.ts). KHÔNG Shopee/growth/Facebook.
 * ========================================================================== */

import { existsSync, readFileSync } from 'node:fs';
import { resolveInsideRepo } from '@/lib/studio-data/paths';

const REGISTRY_REL = 'config/entertainment_channels.json';

/** Kênh NGUỒN (creator Douyin/TikTok TQ) gắn cứng cho ngách — nơi kéo video reup
 * về. KHÁC kênh đích (accountId = nơi đăng VN). URL profile là công khai, KHÔNG secret. */
export interface EntSourceChannel {
  platform: 'douyin' | 'tiktok';
  url: string;
  label?: string;
}

export interface EntChannel {
  channelId: string;
  channelName: string;
  niche: string;
  accountId: string;
  tiktokUsername: string;
  tiktokDisplayName?: string;
  postingMode: 'direct' | 'inbox';
  allowedContentTypes: string[];
  status: 'active' | 'inactive';
  avatar?: string;
  guardPolicy: { topicMismatch: 'block' | 'warn'; crossPost: 'deny' | 'allow' };
  /** Kênh nguồn TQ gắn cứng (optional). Thiếu → "Tải link" rơi về dán URL tay. */
  sourceChannel?: EntSourceChannel;
  /** Engine montage mặc định cho kênh: 'story' (mặc định) | 'anchors'. Thiếu/sai → 'story'. */
  storyEngine?: 'story' | 'anchors';
}

/** Parse + validate block sourceChannel (optional). Sai/thiếu → undefined. */
function coerceSourceChannel(raw: unknown): EntSourceChannel | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const platform = String(r.platform ?? '')
    .trim()
    .toLowerCase();
  const url = String(r.url ?? '').trim();
  if (platform !== 'douyin' && platform !== 'tiktok') return undefined;
  if (!/^https?:\/\//i.test(url)) return undefined;
  return {
    platform,
    url,
    label: r.label ? String(r.label).trim() : undefined,
  };
}

function coerceChannel(raw: Record<string, unknown>): EntChannel | null {
  const channelId = String(raw.channelId ?? '').trim();
  const accountId = String(raw.accountId ?? '').trim();
  const niche = String(raw.niche ?? '').trim();
  if (!channelId || !accountId || !niche) return null;
  const gp = (raw.guardPolicy ?? {}) as { topicMismatch?: unknown; crossPost?: unknown };
  return {
    channelId,
    channelName: String(raw.channelName ?? channelId),
    niche,
    accountId,
    tiktokUsername: String(raw.tiktokUsername ?? '').trim(),
    tiktokDisplayName: raw.tiktokDisplayName ? String(raw.tiktokDisplayName) : undefined,
    postingMode: raw.postingMode === 'inbox' ? 'inbox' : 'direct',
    allowedContentTypes: Array.isArray(raw.allowedContentTypes)
      ? raw.allowedContentTypes.map(String)
      : [],
    status: raw.status === 'inactive' ? 'inactive' : 'active',
    avatar: raw.avatar ? String(raw.avatar) : undefined,
    guardPolicy: {
      topicMismatch: gp.topicMismatch === 'block' ? 'block' : 'warn',
      crossPost: gp.crossPost === 'allow' ? 'allow' : 'deny',
    },
    sourceChannel: coerceSourceChannel(raw.sourceChannel),
    // Guard lớp config: chỉ 'anchors' tường minh; thiếu/sai → 'story' (safe default).
    storyEngine: raw.storyEngine === 'anchors' ? 'anchors' : 'story',
  };
}

/** Đọc + validate toàn bộ kênh. Lỗi/đọc hỏng → [] (route tự báo thiếu kênh). */
export function listChannels(): EntChannel[] {
  const p = resolveInsideRepo(REGISTRY_REL);
  if (!p || !existsSync(p)) return [];
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as {
      channels?: Array<Record<string, unknown>>;
    };
    const out: EntChannel[] = [];
    for (const c of raw.channels ?? []) {
      const ch = coerceChannel(c);
      if (ch) out.push(ch);
    }
    return out;
  } catch {
    return [];
  }
}

export function getChannel(channelId: string): EntChannel | null {
  if (!channelId) return null;
  return listChannels().find((c) => c.channelId === channelId) ?? null;
}

/** Fallback cho job CŨ chưa bind: kênh active đầu tiên cùng niche (migration nhẹ). */
export function getChannelByNiche(niche: string): EntChannel | null {
  if (!niche) return null;
  const all = listChannels();
  return all.find((c) => c.niche === niche && c.status === 'active') ?? null;
}

/**
 * Resolve kênh cho 1 job: ưu tiên channelId tường minh; nếu thiếu (job cũ) thì
 * suy ra từ niche. Trả null nếu không khớp kênh nào — để guard chặn.
 */
export function resolveChannelForJob(input: {
  channelId?: string | null;
  niche?: string | null;
}): EntChannel | null {
  if (input.channelId) return getChannel(input.channelId);
  if (input.niche) return getChannelByNiche(input.niche);
  return null;
}
