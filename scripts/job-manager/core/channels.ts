// Niche → Channel → Job binding config readers (extracted from
// scripts/vfos-job-manager.ts — God-file anatomy Nhịp 1). Behavior-preserving.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHANNELS_CONFIG_PATH, FALLBACK_LANE, NICHES_CONFIG_PATH } from './paths.js';
import type { ChannelConfigEntry, NicheConfigEntry } from './types.js';

/** Đọc config/channels.json (nguồn thật, commit được). Never-throw → []. */
export function loadChannelsConfig(): ChannelConfigEntry[] {
  const abs = resolve(CHANNELS_CONFIG_PATH);
  if (!existsSync(abs)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(abs, 'utf8'));
    return Array.isArray(parsed) ? (parsed as ChannelConfigEntry[]) : [];
  } catch {
    return [];
  }
}

/** Đọc config/niches.json (nguồn thật). Never-throw → []. Mirror loadChannelsConfig. */
export function loadNichesConfig(): NicheConfigEntry[] {
  const abs = resolve(NICHES_CONFIG_PATH);
  if (!existsSync(abs)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(abs, 'utf8'));
    return Array.isArray(parsed) ? (parsed as NicheConfigEntry[]) : [];
  } catch {
    return [];
  }
}

/** Tập lane của niche active. Fallback {FALLBACK_LANE} khi rỗng/thiếu → giữ hành
 * vi cũ (chỉ product-review). Nguồn sự thật thay literal cho đa-ngách về sau. */
export function nicheLanes(): Set<string> {
  const lanes = loadNichesConfig()
    .filter((n) => n.status === 'active' && typeof n.lane === 'string')
    .map((n) => n.lane as string);
  return lanes.length > 0 ? new Set(lanes) : new Set([FALLBACK_LANE]);
}

/** Kênh active thuộc lane của bất kỳ niche active nào. */
export function activeNicheChannels(): ChannelConfigEntry[] {
  const lanes = nicheLanes();
  return loadChannelsConfig().filter(
    (c) =>
      c.status === 'active' &&
      typeof c.lane === 'string' &&
      lanes.has(c.lane) &&
      typeof c.channelId === 'string',
  );
}

/**
 * Resolve channelId cho job mới:
 * - --channel tường minh → phải tồn tại + active đúng lane, sai thì FAIL rõ (không fallback ngầm).
 * - Không truyền → đúng 1 kênh active của lane thì bind kênh đó (default tường minh từ config,
 *   không phải floating state); 0 hoặc nhiều kênh → null + cảnh báo yêu cầu --channel.
 */
export function resolveChannelForCreate(explicitChannelId: string | undefined): {
  ok: boolean;
  channelId: string | null;
  channelName: string | null;
  warning: string | null;
  error: string | null;
} {
  const laneChannels = activeNicheChannels();
  const laneLabel = [...nicheLanes()].join('/');
  if (explicitChannelId) {
    const found = laneChannels.find((c) => c.channelId === explicitChannelId);
    if (!found) {
      return {
        ok: false,
        channelId: null,
        channelName: null,
        warning: null,
        error: `INVALID_CHANNEL: "${explicitChannelId}" không phải kênh active của ngách (lane: ${laneLabel}) trong ${CHANNELS_CONFIG_PATH}.`,
      };
    }
    return {
      ok: true,
      channelId: found.channelId ?? null,
      channelName: found.displayName ?? null,
      warning: null,
      error: null,
    };
  }
  if (laneChannels.length === 1) {
    const only = laneChannels[0];
    return {
      ok: true,
      channelId: only?.channelId ?? null,
      channelName: only?.displayName ?? null,
      warning: null,
      error: null,
    };
  }
  return {
    ok: true,
    channelId: null,
    channelName: null,
    warning:
      laneChannels.length === 0
        ? `Không có kênh active cho ngách (lane: ${laneLabel}) trong ${CHANNELS_CONFIG_PATH} — job tạo KHÔNG gán kênh.`
        : `Ngách (lane: ${laneLabel}) có ${laneChannels.length} kênh active — cần --channel <channelId> tường minh; job tạo KHÔNG gán kênh.`,
    error: null,
  };
}
