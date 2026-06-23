// E1 — money-shot ANCHOR derivation (shared). Single source of truth cho việc
// chọn cửa sổ montage TỪ catch_moments.json (vision-anchor) thay vì hardcode.
// Dùng bởi 03c-moneyshot-coverage (gate) + 10-montage-v2 + 15-audio-ambient-full
// để video & audio luôn cắt CÙNG anchors.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CatchMoment {
  tSec: number;
  score: number;
  what?: string;
}
export interface AnchorPlan {
  anchors: number[];
  lead: number;
  reaction: number;
  source: string;
}

export const DEFAULT_LEAD = 14;
export const DEFAULT_REACTION = 9;
export const DEFAULT_MIN_ANCHORS = 3; // dưới mức này = video nghèo cảnh ăn tiền → coverage FAIL
export const DEFAULT_MAX_ANCHORS = 6; // cắt gọn cho short-form
export const STRONG_SCORE = 8; // score ≥ = cảnh "ăn tiền" rõ ràng
// Fallback CỨNG chỉ khi KHÔNG có catch_moments (giữ tương thích job cũ squid).
export const FALLBACK_ANCHORS = [3.5, 136.5, 227.5, 290.5, 346.5];

/**
 * Chọn anchors từ catch_moments: cụm các mốc cách nhau ≤ (lead+reaction) thành 1
 * cửa sổ (tránh chồng), giữ mốc score cao nhất mỗi cụm; nếu > max thì lấy top
 * theo score rồi sắp lại theo thời gian.
 */
export function deriveAnchors(
  moments: CatchMoment[],
  opts: { lead?: number; reaction?: number; max?: number } = {},
): { anchors: number[]; picked: CatchMoment[] } {
  const lead = opts.lead ?? DEFAULT_LEAD;
  const reaction = opts.reaction ?? DEFAULT_REACTION;
  const max = opts.max ?? DEFAULT_MAX_ANCHORS;
  const minGap = lead + reaction;
  const sorted = [...moments]
    .filter((m) => Number.isFinite(m.tSec))
    .sort((a, b) => a.tSec - b.tSec);
  const clusters: CatchMoment[][] = [];
  for (const m of sorted) {
    const last = clusters[clusters.length - 1];
    const prev = last?.[last.length - 1];
    if (last && prev && m.tSec - prev.tSec <= minGap) last.push(m);
    else clusters.push([m]);
  }
  let picked = clusters.map((c) => c.reduce((best, m) => (m.score > best.score ? m : best)));
  if (picked.length > max) {
    picked = [...picked]
      .sort((a, b) => b.score - a.score)
      .slice(0, max)
      .sort((a, b) => a.tSec - b.tSec);
  }
  return { anchors: picked.map((p) => Number(p.tSec.toFixed(1))), picked };
}

/**
 * Đọc anchor plan cho 1 job: ưu tiên anchors.json (do 03c ghi từ catch_moments);
 * nếu thiếu thì derive trực tiếp từ catch_moments.json; cuối cùng mới fallback
 * hardcode (chỉ khi không có vision data nào).
 */
export function readAnchorPlan(dir: string): AnchorPlan {
  const aPath = join(dir, 'anchors.json');
  if (existsSync(aPath)) {
    try {
      const j = JSON.parse(readFileSync(aPath, 'utf8')) as Partial<AnchorPlan>;
      if (Array.isArray(j.anchors) && j.anchors.length > 0) {
        return {
          anchors: j.anchors,
          lead: j.lead ?? DEFAULT_LEAD,
          reaction: j.reaction ?? DEFAULT_REACTION,
          source: j.source ?? 'anchors.json',
        };
      }
    } catch {
      /* ignore, fall through */
    }
  }
  const cPath = join(dir, 'catch_moments.json');
  if (existsSync(cPath)) {
    try {
      const c = JSON.parse(readFileSync(cPath, 'utf8')) as { moments?: CatchMoment[] };
      const { anchors } = deriveAnchors(c.moments ?? []);
      if (anchors.length > 0) {
        return {
          anchors,
          lead: DEFAULT_LEAD,
          reaction: DEFAULT_REACTION,
          source: 'catch_moments',
        };
      }
    } catch {
      /* ignore, fall through */
    }
  }
  return {
    anchors: FALLBACK_ANCHORS,
    lead: DEFAULT_LEAD,
    reaction: DEFAULT_REACTION,
    source: 'fallback-hardcoded',
  };
}
