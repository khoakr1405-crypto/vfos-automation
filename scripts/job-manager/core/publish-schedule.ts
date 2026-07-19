/* =============================================================================
 * VFOS — Publish rhythm SLOT SCHEDULER core (Phần 82, R-B) — PURE, no I/O.
 * -----------------------------------------------------------------------------
 * Nơi ở của TOÀN BỘ logic an toàn của máy tick tự đăng: sinh slot giờ vàng,
 * bind job đã duyệt vào slot, và các GUARD chặn đăng sai (cap ngày · spacing ·
 * rate-limit · cửa sổ giờ · busy-lock). Tách khỏi I/O + network để test thuần.
 *
 * No-Go liên quan (đọc kỹ trước khi sửa):
 *  - #3 auto-publish: máy tick CHỈ thay CLICK ở nhánh job đã APPROVED/AUTO_APPROVED.
 *    Guard ở đây là hàng rào cuối chống đăng vượt tần suất / đăng trùng / đăng dồn.
 *  - #7 no floating state: slot bind jobId TƯỜNG MINH + deterministic slotId; không
 *    "jobs[0]"/latest. Một job chỉ chiếm 1 slot; slotId ổn định để idempotent.
 *
 * Thời gian: mọi giờ vàng là GIỜ VIỆT NAM (UTC+7, không DST) — dựng ISO bằng offset
 * '+07:00' TƯỜNG MINH nên deterministic bất kể timezone máy chạy. Guard số học chạy
 * trên epoch ms (TZ-independent) → test vàng không flaky theo máy.
 * ========================================================================== */

export type PublishPlatform = 'tiktok' | 'facebook';
export type PublishLane = 'review' | 'ent';
/** EMPTY → BOUND → (FIRED | SKIPPED). SKIPPED có thể rebind 1 lần → BOUND lại. */
export type SlotState = 'EMPTY' | 'BOUND' | 'FIRED' | 'SKIPPED';

/** VN không có DST — offset cố định, an toàn để dựng mốc giờ vàng deterministic. */
export const VN_UTC_OFFSET = '+07:00';

/** Ngưỡng guard mặc định (đổi qua config chứ đừng hardcode nơi khác). */
export const PUBLISH_GUARDS = {
  /** Trần bài/ngày/target — chống spam nền tảng (rủi ro unoriginal enforcement). */
  maxPerDay: 3,
  /** Giãn cách tối thiểu giữa 2 lần FIRED cùng target. */
  minSpacingMs: 3 * 60 * 60 * 1000,
  /** Rate-limit gọi API: tối đa N request trong cửa sổ. */
  rateMaxPerWindow: 6,
  rateWindowMs: 60 * 1000,
  /** TikTok phải bắn TRONG cửa sổ này sau giờ slot (laptop phải bật). */
  tiktokFireWindowMs: 30 * 60 * 1000,
  /** FB đẩy sớm khi slot nằm trong (now+minLead, now+maxLead] — FB tự đăng đúng giờ. */
  fbMinLeadMs: 15 * 60 * 1000,
  fbMaxLeadMs: 24 * 60 * 60 * 1000,
  /** busy-lock: đang POSTING < ngưỡng này thì coi như bận, không bắn chồng. */
  busyLockMs: 10 * 60 * 1000,
} as const;

/** Giờ vàng mặc định mỗi target (giờ VN). */
export const DEFAULT_SLOT_TIMES_LOCAL = ['11:30', '17:30', '20:30'] as const;

export interface PublishTarget {
  /** Định danh đích đăng — VD 'tt_review_main' (TikTok) | 'fb_ent_page' (FB). */
  targetId: string;
  lane: PublishLane;
  platform: PublishPlatform;
  /** 'HH:MM' giờ VN; mặc định DEFAULT_SLOT_TIMES_LOCAL. */
  slotTimesLocal: string[];
  maxPerDay: number;
}

export interface PublishSlot {
  /** `${targetId}__${YYYY-MM-DD}__${HHMM}` — deterministic, idempotent key. */
  slotId: string;
  targetId: string;
  lane: PublishLane;
  platform: PublishPlatform;
  /** ISO của mốc giờ vàng (đã quy về UTC từ giờ VN). */
  scheduledAt: string;
  state: SlotState;
  // Optional fields khai báo `| undefined` (thay vì chỉ `?`) để transition thuần
  // spread/clear được dưới exactOptionalPropertyTypes mà không cần conditional spread.
  /** Job được bind TƯỜNG MINH (No-Go #7). Chỉ set khi state !== EMPTY. */
  jobId?: string | undefined;
  /** Caption đã resolve lúc bind (freeze để đăng đúng nội dung đã duyệt). */
  caption?: string | undefined;
  boundAt?: string | undefined;
  firedAt?: string | undefined;
  skippedAt?: string | undefined;
  /** Số lần rebind sau khi lỡ cửa sổ (tối đa 1 theo plan). */
  rebinds?: number | undefined;
  /** Bằng chứng đăng (không token). */
  result?:
    | {
        postId?: string | undefined;
        shareUrl?: string | undefined;
        permalinkUrl?: string | undefined;
        videoId?: string | undefined;
        publishId?: string | undefined;
      }
    | undefined;
  error?: { code: string; message: string } | undefined;
}

export interface PublishScheduleFile {
  schemaVersion: number;
  updatedAt: string;
  slots: PublishSlot[];
}

export const PUBLISH_SCHEDULE_SCHEMA_VERSION = 1;

/* --------------------------------------------------------------------------
 * Thời gian VN (deterministic, không phụ thuộc TZ máy chạy)
 * ------------------------------------------------------------------------ */

/** 'YYYY-MM-DD' theo lịch VN cho một mốc epoch ms. */
export function vnDayKey(nowMs: number): string {
  // Dịch +7h rồi lấy phần ngày ở UTC = ngày theo lịch VN.
  const shifted = new Date(nowMs + 7 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** '11:30' → '1130' (dùng cho slotId). */
export function hhmmCompact(hhmm: string): string {
  return hhmm.replace(':', '');
}

/** epoch ms của mốc giờ vàng (dayKey + 'HH:MM' giờ VN). */
export function slotTimeMs(dayKey: string, hhmmLocal: string): number {
  return new Date(`${dayKey}T${hhmmLocal}:00${VN_UTC_OFFSET}`).getTime();
}

export function makeSlotId(targetId: string, dayKey: string, hhmmLocal: string): string {
  return `${targetId}__${dayKey}__${hhmmCompact(hhmmLocal)}`;
}

/** Sinh slot EMPTY cho một ngày của một target (deterministic). */
export function buildDaySlots(target: PublishTarget, dayKey: string): PublishSlot[] {
  return target.slotTimesLocal.map((hhmm) => ({
    slotId: makeSlotId(target.targetId, dayKey, hhmm),
    targetId: target.targetId,
    lane: target.lane,
    platform: target.platform,
    scheduledAt: new Date(slotTimeMs(dayKey, hhmm)).toISOString(),
    state: 'EMPTY' as const,
  }));
}

/**
 * Merge các slot EMPTY còn thiếu cho hôm nay..+daysAhead vào tập slot hiện có
 * (KHÔNG đụng slot đã BOUND/FIRED/SKIPPED — chỉ thêm EMPTY mới theo slotId chưa có).
 */
export function ensureSlots(
  existing: PublishSlot[],
  targets: PublishTarget[],
  nowMs: number,
  daysAhead = 1,
): PublishSlot[] {
  const known = new Set(existing.map((s) => s.slotId));
  const added: PublishSlot[] = [];
  for (let d = 0; d <= daysAhead; d++) {
    const dayKey = vnDayKey(nowMs + d * 24 * 60 * 60 * 1000);
    for (const target of targets) {
      for (const slot of buildDaySlots(target, dayKey)) {
        if (!known.has(slot.slotId)) {
          known.add(slot.slotId);
          added.push(slot);
        }
      }
    }
  }
  return [...existing, ...added];
}

/* --------------------------------------------------------------------------
 * GUARDS — hàng rào an toàn (đơn vị: epoch ms, thuần số học)
 * ------------------------------------------------------------------------ */

/** Số slot đã FIRED của target trong ngày VN của mốc `atMs`. */
export function firedCountForDay(slots: PublishSlot[], targetId: string, atMs: number): number {
  const dayKey = vnDayKey(atMs);
  return slots.filter(
    (s) =>
      s.targetId === targetId &&
      s.state === 'FIRED' &&
      typeof s.firedAt === 'string' &&
      vnDayKey(Date.parse(s.firedAt)) === dayKey,
  ).length;
}

/** Còn quota ngày? (đã FIRED < maxPerDay). */
export function capOk(
  slots: PublishSlot[],
  targetId: string,
  atMs: number,
  maxPerDay: number,
): boolean {
  return firedCountForDay(slots, targetId, atMs) < maxPerDay;
}

/** Đủ giãn cách với mọi lần FIRED trước của target? */
export function spacingOk(
  slots: PublishSlot[],
  targetId: string,
  candidateMs: number,
  minSpacingMs: number = PUBLISH_GUARDS.minSpacingMs,
): boolean {
  for (const s of slots) {
    if (s.targetId !== targetId || s.state !== 'FIRED' || !s.firedAt) continue;
    if (Math.abs(candidateMs - Date.parse(s.firedAt)) < minSpacingMs) return false;
  }
  return true;
}

/** Chưa vượt rate-limit API? recentFireMs = mốc các lần bắn gần đây (epoch ms). */
export function rateOk(
  recentFireMs: number[],
  nowMs: number,
  maxPerWindow: number = PUBLISH_GUARDS.rateMaxPerWindow,
  windowMs: number = PUBLISH_GUARDS.rateWindowMs,
): boolean {
  const inWindow = recentFireMs.filter((t) => t > nowMs - windowMs && t <= nowMs).length;
  return inWindow < maxPerWindow;
}

/** TikTok due-fire: now nằm trong [slot, slot+window]. */
export function dueForTikTok(
  slot: PublishSlot,
  nowMs: number,
  windowMs: number = PUBLISH_GUARDS.tiktokFireWindowMs,
): boolean {
  const at = Date.parse(slot.scheduledAt);
  return nowMs >= at && nowMs <= at + windowMs;
}

/** Đã lỡ cửa sổ TikTok? (now > slot+window). */
export function missedTikTokWindow(
  slot: PublishSlot,
  nowMs: number,
  windowMs: number = PUBLISH_GUARDS.tiktokFireWindowMs,
): boolean {
  return nowMs > Date.parse(slot.scheduledAt) + windowMs;
}

/** FB early-push: slot nằm trong (now+minLead, now+maxLead] để hẹn giờ native. */
export function withinFbScheduleWindow(
  slot: PublishSlot,
  nowMs: number,
  minLeadMs: number = PUBLISH_GUARDS.fbMinLeadMs,
  maxLeadMs: number = PUBLISH_GUARDS.fbMaxLeadMs,
): boolean {
  const at = Date.parse(slot.scheduledAt);
  return at > nowMs + minLeadMs && at <= nowMs + maxLeadMs;
}

/**
 * Slot EMPTY tương lai gần nhất của target để bind job mới. Ưu tiên slot chưa tới
 * hoặc còn trong cửa sổ (không bind vào slot đã lỡ hẳn). Trả null nếu hết chỗ hôm nay.
 */
export function nextEmptySlotForTarget(
  slots: PublishSlot[],
  targetId: string,
  nowMs: number,
  tiktokWindowMs: number = PUBLISH_GUARDS.tiktokFireWindowMs,
): PublishSlot | null {
  const candidates = slots
    .filter((s) => s.targetId === targetId && s.state === 'EMPTY')
    .filter((s) => Date.parse(s.scheduledAt) + tiktokWindowMs > nowMs)
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  return candidates[0] ?? null;
}

/* --------------------------------------------------------------------------
 * TRANSITIONS — thuần, trả slot MỚI (không mutate) để store áp lại
 * ------------------------------------------------------------------------ */

export function bindJobToSlot(
  slot: PublishSlot,
  jobId: string,
  caption: string,
  nowIso: string,
): PublishSlot {
  return {
    ...slot,
    state: 'BOUND',
    jobId,
    caption,
    boundAt: nowIso,
    error: undefined,
  };
}

export function markFired(
  slot: PublishSlot,
  result: NonNullable<PublishSlot['result']>,
  nowIso: string,
): PublishSlot {
  return { ...slot, state: 'FIRED', firedAt: nowIso, result, error: undefined };
}

export function markSkipped(
  slot: PublishSlot,
  error: { code: string; message: string },
  nowIso: string,
): PublishSlot {
  return { ...slot, state: 'SKIPPED', skippedAt: nowIso, error };
}

/** Cập nhật một slot theo slotId trong mảng (immutably). */
export function replaceSlot(slots: PublishSlot[], next: PublishSlot): PublishSlot[] {
  return slots.map((s) => (s.slotId === next.slotId ? next : s));
}

/* --------------------------------------------------------------------------
 * CONFIG — 4 tầng phanh (No-Go #3 nới có điều kiện). Mặc định AN TOÀN TUYỆT ĐỐI.
 * ------------------------------------------------------------------------ */

export interface PublishTickConfig {
  /** Master switch VFOS_PUBLISH_TICK — TẮT mặc định. Tắt → chỉ dry-run, KHÔNG bắn. */
  enabled: boolean;
  /** TIKTOK_PUBLISH_LIVE==='true' — cổng nền tảng TikTok (bắn thật cần cả 2). */
  liveTiktok: boolean;
  /** META_MODE==='live' — cổng nền tảng Facebook. */
  liveFacebook: boolean;
  /** Buộc dry-run bất kể switch (CLI --dry-run) — để diễn tập an toàn. */
  forceDryRun: boolean;
}

function switchOn(raw: string | undefined): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  return v === 'on' || v === '1' || v === 'true' || v === 'yes';
}

export function parsePublishTickConfig(
  env: Record<string, string | undefined>,
  forceDryRun = false,
): PublishTickConfig {
  return {
    enabled: switchOn(env.VFOS_PUBLISH_TICK),
    liveTiktok: (env.TIKTOK_PUBLISH_LIVE ?? '').trim().toLowerCase() === 'true',
    liveFacebook: (env.META_MODE ?? '').trim().toLowerCase() === 'live',
    forceDryRun,
  };
}

/**
 * Một lần bắn cụ thể có được đi LIVE không? Cần: master ON + không force dry-run +
 * cờ nền tảng tương ứng LIVE. Thiếu bất kỳ điều kiện → dry-run (log, không network).
 * Đây là hàng rào cuối cùng trước mọi lệnh gọi mạng đăng bài.
 */
export function fireIsLive(config: PublishTickConfig, platform: PublishPlatform): boolean {
  if (!config.enabled || config.forceDryRun) return false;
  return platform === 'tiktok' ? config.liveTiktok : config.liveFacebook;
}
