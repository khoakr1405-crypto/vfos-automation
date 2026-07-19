/* =============================================================================
 * VFOS — PUBLISH RHYTHM TICK (Phần 82, R-B) — máy nhịp tự đăng theo lịch giờ vàng.
 * -----------------------------------------------------------------------------
 * Chạy 5 phút/lần (Task Scheduler) hoặc tay `pnpm tick:publish`. Mỗi run:
 *   halt-check → lock → ensureSlots → DISCOVER job đã duyệt → BIND vào slot trống
 *   → tới giờ + qua GUARD thì FIRE → ghi board + audit → thả lock.
 *
 * TRIẾT LÝ AN TOÀN (No-Go #3 nới CÓ ĐIỀU KIỆN — mặc định TẮT):
 *  1. Máy tick KHÔNG cầm token, KHÔNG gọi API nền tảng. Nó chỉ PHÁT HIỆN job sẵn
 *     sàng rồi POST vào route Studio (localhost) — mọi guard mis-post (G4 resolve
 *     token theo accountId, G7 identity, ALREADY_POSTED) chạy SERVER-SIDE ở route.
 *  2. FIRE thật cần đủ 3 tầng: VFOS_PUBLISH_TICK=on + cờ nền tảng (TIKTOK_PUBLISH_LIVE
 *     / META_MODE=live) + KHÔNG --dry-run. Thiếu bất kỳ → DRY-RUN: chỉ log dự định.
 *  3. Mặc định (không set gì / không server) = DRY-RUN: KHÔNG network, KHÔNG đăng.
 *  4. Phanh tổng publish-halt.json → dừng ngay đầu run.
 *
 * ⚠ Giới hạn R-B đã biết (chờ Operator/round sau):
 *  - Route ent facebook-publish hiện ĐĂNG NGAY (chưa truyền scheduled_publish_time),
 *    nên FB cũng bắn theo cửa-giờ (laptop phải bật). Khả năng hẹn-giờ native đã có
 *    trong packages/facebook publish-reels (videoState=SCHEDULED) nhưng CHƯA nối qua
 *    route → "đẩy sớm laptop-tắt-vẫn-đăng" là bước wiring sau.
 *  - Auto-refresh token TikTok CHƯA làm ở tick (route trả auth_expired → board nhắc
 *    Operator refresh tay). Đây là fail-safe, không phải bỏ sót âm thầm.
 * ========================================================================== */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  type ReviewManifestLike,
  entPreviewReadyToPublish,
  isEntAlreadyPosted,
  isReviewAlreadyPosted,
  isReviewApproved,
  requireEntAccountId,
  resolveEntCaption,
  resolveReviewCaption,
  resolveReviewVideoRel,
} from './job-manager/core/publish-discovery.js';
import {
  DEFAULT_SLOT_TIMES_LOCAL,
  type PublishSlot,
  type PublishTarget,
  bindJobToSlot,
  dueForTikTok,
  ensureSlots,
  fireIsLive,
  markFired,
  markSkipped,
  missedTikTokWindow,
  nextEmptySlotForTarget,
  parsePublishTickConfig,
  rateOk,
  replaceSlot,
  spacingOk,
  vnDayKey,
} from './job-manager/core/publish-schedule.js';
import {
  type AuditEntry,
  acquireLock,
  appendAudit,
  isHalted,
  readSchedule,
  releaseLock,
  repoRoot,
  resolveRepo,
  writeBoard,
  writeSchedule,
} from './job-manager/core/publish-store.js';

// Stale-takeover backstop. PHẢI > tổng thời gian fire tối đa 1 tick: 2 target ×
// FIRE_TIMEOUT_MS (2 fire tuần tự) ≈ 19.7min → đặt 30min để tick live-lâu KHÔNG
// bị tick sau cướp lock (kết hợp pidAlive check trong acquireLock). Xem review R-B.
const FIRE_TIMEOUT_MS = 590_000;
const LOCK_STALE_MS = 30 * 60 * 1000;
const REVIEW_TARGET_ID = (process.env.REVIEW_TIKTOK_ACCOUNT_ID || 'tt_review_main').trim();
const ENT_FB_TARGET_ID = (process.env.ENT_FB_TARGET_ID || 'fb_ent_page').trim();
const STUDIO_BASE = (process.env.VFOS_STUDIO_BASE_URL || 'http://localhost:3002').replace(
  /\/+$/,
  '',
);

const TARGETS: PublishTarget[] = [
  {
    targetId: REVIEW_TARGET_ID,
    lane: 'review',
    platform: 'tiktok',
    slotTimesLocal: [...DEFAULT_SLOT_TIMES_LOCAL],
    maxPerDay: 3,
  },
  {
    targetId: ENT_FB_TARGET_ID,
    lane: 'ent',
    platform: 'facebook',
    slotTimesLocal: [...DEFAULT_SLOT_TIMES_LOCAL],
    maxPerDay: 3,
  },
];

interface Candidate {
  jobId: string;
  lane: 'review' | 'ent';
  targetId: string;
  platform: 'tiktok' | 'facebook';
  caption: string;
  /** ENT mis-post key (đã xác nhận tường minh); review không dùng. */
  accountId?: string;
}

/* ── helpers I/O never-throw ─────────────────────────────────────────────── */

function readJson<T>(abs: string): T | null {
  try {
    if (!existsSync(abs)) return null;
    return JSON.parse(readFileSync(abs, 'utf8')) as T;
  } catch {
    return null;
  }
}

function safeMtime(abs: string): number {
  try {
    return statSync(abs).mtimeMs;
  } catch {
    return 0;
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function entAutoEnabled(): boolean {
  const norm = (raw: string | undefined): boolean | undefined => {
    if (raw === undefined) return undefined;
    const v = raw.trim().toLowerCase();
    if (['on', '1', 'true', 'yes'].includes(v)) return true;
    if (['off', '0', 'false', 'no', ''].includes(v)) return false;
    return undefined;
  };
  return norm(process.env.VFOS_AUTO_APPROVE_ENT) ?? norm(process.env.VFOS_AUTO_APPROVE) ?? false;
}

/* ── DISCOVERY ───────────────────────────────────────────────────────────── */

function discoverReview(root: string): Candidate[] {
  const jobsDir = resolveRepo('data/temp/jobs', root);
  if (!existsSync(jobsDir)) return [];
  const registry =
    readJson<{
      jobs?: Array<{ jobId?: string; operatorDecision?: unknown; captionedPreviewPath?: unknown }>;
    }>(resolveRepo('data/temp/vfos_jobs_registry.json', root))?.jobs ?? [];
  const out: Candidate[] = [];
  for (const name of readdirSync(jobsDir)) {
    const dir = join(jobsDir, name);
    const manifest = readJson<ReviewManifestLike & { jobId?: string }>(
      join(dir, 'job_manifest.json'),
    );
    if (!manifest) continue;
    const jobId = manifest.jobId ?? name;
    const entry = registry.find((e) => e.jobId === jobId) ?? null;
    if (!isReviewApproved(manifest, entry)) continue;
    const status = readJson<{ status?: unknown }>(join(dir, 'tiktok_publish_status.json'));
    if (isReviewAlreadyPosted(status)) continue;
    const videoRel = resolveReviewVideoRel(manifest, entry);
    if (!videoRel || !existsSync(resolveRepo(videoRel, root))) continue; // fail-safe
    const caption = resolveReviewCaption(readJson(join(dir, 'script_artifact.json')));
    if (!caption) continue;
    out.push({ jobId, lane: 'review', targetId: REVIEW_TARGET_ID, platform: 'tiktok', caption });
  }
  return out;
}

/** audioPolicyApplied faithfully từ montage_v2 report + mtime (fail-safe → false). */
function entAudioPolicyApplied(dir: string): boolean {
  const rep = readJson<{ demucs?: unknown; fallbackUsed?: unknown; hasAudio?: unknown }>(
    join(dir, 'montage_v2', 'montage_v2_audio_report.json'),
  );
  if (!rep) return false;
  const ambient = join(dir, 'montage_v2_short_ambient.mp4');
  const short = join(dir, 'montage_v2_short.mp4');
  if (!existsSync(ambient)) return false;
  return (
    rep.demucs === 'htdemucs/ok' &&
    (rep.fallbackUsed === null || rep.fallbackUsed === undefined) &&
    rep.hasAudio === true &&
    safeMtime(ambient) >= safeMtime(short)
  );
}

/** anyStepRunning với pid-stale: running thật khi pid sống HOẶC (no-pid & age<120s). */
function entAnyStepRunning(dir: string): boolean {
  const stepsDir = join(dir, 'steps');
  if (!existsSync(stepsDir)) return false;
  for (const f of readdirSync(stepsDir)) {
    if (!f.endsWith('.json')) continue;
    const st = readJson<{ state?: unknown; pid?: unknown; startedAt?: unknown }>(join(stepsDir, f));
    if (st?.state !== 'running') continue;
    const pid = typeof st.pid === 'number' ? st.pid : 0;
    if (pid > 0) {
      if (pidAlive(pid)) return true; // đang chạy thật
      continue; // pid chết → stale, coi như không chạy
    }
    // không có pid: chỉ coi là chạy nếu còn tươi (<120s); cũ → stale.
    const age = Date.now() - (typeof st.startedAt === 'string' ? Date.parse(st.startedAt) : 0);
    if (Number.isFinite(age) && age < 120_000) return true;
  }
  return false;
}

function discoverEnt(root: string): Candidate[] {
  const entDir = resolveRepo('data/temp/ent', root);
  if (!existsSync(entDir)) return [];
  const autoEnabled = entAutoEnabled();
  const out: Candidate[] = [];
  for (const name of readdirSync(entDir)) {
    const dir = join(entDir, name);
    const manifest = readJson<
      Record<string, unknown> & {
        jobId?: string;
        accountId?: string;
        reviewGates?: { scriptApproved?: unknown; previewApproved?: unknown };
        tiktok?: { status?: unknown } | null;
        facebook?: { status?: unknown } | null;
      }
    >(join(dir, 'ent_job.json'));
    if (!manifest) continue;
    const jobId = manifest.jobId ?? name;
    const accountId = requireEntAccountId(manifest);
    if (!accountId) continue; // mis-post safety: KHÔNG suy niche
    if (isEntAlreadyPosted(manifest)) continue;

    const verdict = readJson<{ verdict?: unknown }>(join(dir, 'auto_approve_report.json'))?.verdict;
    const ready = entPreviewReadyToPublish({
      autoApproveEnabled: autoEnabled,
      verdict:
        verdict === 'PASS' || verdict === 'FAIL' || verdict === 'NEEDS_HUMAN' ? verdict : null,
      manifestPreviewApproved: manifest.reviewGates?.previewApproved === true,
      scriptApproved: manifest.reviewGates?.scriptApproved === true,
      voiceRenderDone: existsSync(join(dir, 'montage_v2', 'montage_v2_render_report.json')),
      previewFileExists:
        existsSync(join(dir, 'montage_v2_short_ambient.mp4')) ||
        existsSync(join(dir, 'montage_v2_short.mp4')),
      audioPolicyApplied: entAudioPolicyApplied(dir),
      anyStepRunning: entAnyStepRunning(dir),
    });
    if (!ready) continue;
    const caption = resolveEntCaption(readJson(join(dir, 'montage_v2', 'package.json')));
    if (!caption) continue;
    out.push({
      jobId,
      lane: 'ent',
      targetId: ENT_FB_TARGET_ID,
      platform: 'facebook',
      caption,
      accountId,
    });
  }
  return out;
}

/**
 * Đếm bài THỰC SỰ đã đăng hôm nay (VN) tới target — gồm CẢ Operator đăng tay lẫn
 * tick, đọc từ status file (nguồn sự thật "đã đăng"). Fold vào cap để guard chống
 * spam đếm đúng TỔNG manual+auto (review R-B F7), không chỉ slot tick FIRED.
 * Mỗi bài = 1 status file nên không đếm trùng với slot FIRED (route ghi status khi
 * tick bắn). Fail-safe: thiếu postedAt → không đếm (tránh chặn nhầm bài cũ).
 * Review→TikTok: tiktok_publish_status.json (POSTED + accountId khớp + postedAt hôm nay).
 * ENT→FB: ent_job.json facebook.status POSTED/PUBLISHED + postedAt hôm nay (best-effort).
 */
function countPostedToday(
  targetId: string,
  lane: 'review' | 'ent',
  root: string,
  nowMs: number,
): number {
  const today = vnDayKey(nowMs);
  let n = 0;
  if (lane === 'review') {
    const jobsDir = resolveRepo('data/temp/jobs', root);
    if (!existsSync(jobsDir)) return 0;
    for (const name of readdirSync(jobsDir)) {
      const st = readJson<{ status?: unknown; accountId?: unknown; postedAt?: unknown }>(
        join(jobsDir, name, 'tiktok_publish_status.json'),
      );
      if (st?.status !== 'POSTED') continue;
      if (typeof st.accountId === 'string' && st.accountId !== targetId) continue;
      if (typeof st.postedAt === 'string' && vnDayKey(Date.parse(st.postedAt)) === today) n++;
    }
  } else {
    const entDir = resolveRepo('data/temp/ent', root);
    if (!existsSync(entDir)) return 0;
    for (const name of readdirSync(entDir)) {
      const m = readJson<{ facebook?: { status?: unknown; postedAt?: unknown } | null }>(
        join(entDir, name, 'ent_job.json'),
      );
      const fb = m?.facebook;
      if (fb?.status !== 'POSTED' && fb?.status !== 'PUBLISHED') continue;
      if (typeof fb.postedAt === 'string' && vnDayKey(Date.parse(fb.postedAt)) === today) n++;
    }
  }
  return n;
}

/* ── FIRE (live) — POST route Studio; guard chạy server-side ──────────────── */

async function fireViaRoute(
  c: Candidate,
): Promise<{ ok: boolean; detail: string; result?: PublishSlot['result'] }> {
  const url =
    c.lane === 'review'
      ? `${STUDIO_BASE}/api/studio/jobs/${c.jobId}/publish-tiktok`
      : `${STUDIO_BASE}/api/studio/entertainment/jobs/${c.jobId}/facebook-publish`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ caption: c.caption }),
      signal: AbortSignal.timeout(FIRE_TIMEOUT_MS),
    });
    // Hai route trả SHAPE KHÁC NHAU: review/tiktok → { status:{postId,shareUrl,
    // publishId} }; ent/facebook → { summary:{videoId,permalinkUrl,...} }. Đọc
    // đúng nhánh để board/audit giữ được bằng chứng (permalink/videoId) đăng.
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      code?: string;
      message?: string;
      status?: { postId?: string; shareUrl?: string; publishId?: string };
      summary?: { videoId?: string; permalinkUrl?: string };
      videoId?: string;
      permalinkUrl?: string;
    };
    if (json.ok === true) {
      return {
        ok: true,
        detail: 'POSTED',
        result: {
          postId: json.status?.postId,
          shareUrl: json.status?.shareUrl,
          publishId: json.status?.publishId,
          videoId: json.summary?.videoId ?? json.videoId,
          permalinkUrl: json.summary?.permalinkUrl ?? json.permalinkUrl,
        },
      };
    }
    return { ok: false, detail: `${json.code ?? `http_${res.status}`}: ${json.message ?? 'fail'}` };
  } catch (e) {
    return { ok: false, detail: `network_error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/* ── MAIN ────────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { 'dry-run': { type: 'boolean' } },
    strict: false,
  });
  const forceDryRun = values['dry-run'] === true;
  const config = parsePublishTickConfig(process.env, forceDryRun);
  const root = repoRoot();
  const nowMs = Date.now();
  const nowIso = new Date().toISOString();
  const audit: AuditEntry[] = [];
  const rec = (e: Omit<AuditEntry, 'at'>) => {
    const entry = { at: nowIso, ...e };
    audit.push(entry);
    appendAudit(entry, root);
  };

  console.log(
    `[tick] ${nowIso} — master=${config.enabled ? 'ON' : 'off'} liveTT=${config.liveTiktok} liveFB=${config.liveFacebook} dryRun=${!config.enabled || forceDryRun}`,
  );

  if (isHalted(root)) {
    console.log('[tick] 🛑 HALT file bật — dừng ngay, không làm gì.');
    rec({ event: 'halt', detail: 'publish-halt.json active' });
    process.exit(0);
  }
  if (!acquireLock(nowMs, LOCK_STALE_MS, root)) {
    console.log('[tick] 🔒 tick khác đang chạy (lock còn hạn) — bỏ qua run này.');
    process.exit(0);
  }

  try {
    const schedule = readSchedule(root);
    let slots = ensureSlots(schedule.slots, TARGETS, nowMs, 1);

    // DISCOVER
    const candidates = [...discoverReview(root), ...discoverEnt(root)];
    console.log(`[tick] discover: ${candidates.length} job đã duyệt sẵn sàng.`);

    // BIND — mỗi job chỉ 1 slot; bỏ job đã chiếm slot BOUND/FIRED.
    const occupied = new Set(
      slots.filter((s) => s.state !== 'EMPTY' && s.jobId).map((s) => s.jobId as string),
    );
    for (const c of candidates) {
      if (occupied.has(c.jobId)) continue;
      const slot = nextEmptySlotForTarget(slots, c.targetId, nowMs);
      if (!slot) {
        rec({
          event: 'block',
          jobId: c.jobId,
          targetId: c.targetId,
          detail: 'hết slot trống hôm nay',
        });
        continue;
      }
      slots = replaceSlot(slots, bindJobToSlot(slot, c.jobId, c.caption, nowIso));
      occupied.add(c.jobId);
      rec({ event: 'bind', slotId: slot.slotId, jobId: c.jobId, targetId: c.targetId });
      console.log(`[tick] 🔗 bind ${c.jobId} → ${slot.slotId} (${c.lane})`);
    }

    // FIRE — duyệt slot BOUND tới giờ.
    const capById = new Map(TARGETS.map((t) => [t.targetId, t.maxPerDay] as const));
    const firedThisTick = new Set<string>(); // 1 target chỉ bắn 1 lần/tick (busy-lock proxy)
    const recentFireMs = slots
      .filter((s) => s.state === 'FIRED' && s.firedAt)
      .map((s) => Date.parse(s.firedAt as string));

    for (const slot of slots.filter((s) => s.state === 'BOUND')) {
      if (missedTikTokWindow(slot, nowMs)) {
        const rebinds = slot.rebinds ?? 0;
        if (rebinds < 1) {
          // rebind 1 lần: nhả slot cũ, để lượt sau bind slot mới.
          const empty = nextEmptySlotForTarget(slots, slot.targetId, nowMs);
          slots = replaceSlot(slots, {
            ...slot,
            state: 'EMPTY',
            jobId: undefined,
            caption: undefined,
            boundAt: undefined,
          });
          if (empty && empty.slotId !== slot.slotId) {
            slots = replaceSlot(slots, {
              ...bindJobToSlot(empty, slot.jobId as string, slot.caption as string, nowIso),
              rebinds: rebinds + 1,
            });
            rec({
              event: 'skip',
              slotId: slot.slotId,
              jobId: slot.jobId,
              detail: `lỡ cửa → rebind #${rebinds + 1}`,
            });
          } else {
            rec({
              event: 'skip',
              slotId: slot.slotId,
              jobId: slot.jobId,
              detail: 'lỡ cửa, không còn slot → chờ',
            });
          }
        } else {
          slots = replaceSlot(
            slots,
            markSkipped(
              slot,
              { code: 'MISSED_TWICE', message: 'lỡ cửa 2 lần — chờ Operator' },
              nowIso,
            ),
          );
          rec({
            event: 'skip',
            slotId: slot.slotId,
            jobId: slot.jobId,
            detail: 'lỡ cửa lần 2 → SKIPPED',
          });
        }
        continue;
      }

      if (!dueForTikTok(slot, nowMs)) continue; // chưa tới giờ (cả 2 nền tảng dùng cửa-giờ ở R-B)

      // GUARDS
      const maxPerDay = capById.get(slot.targetId) ?? 3;
      if (firedThisTick.has(slot.targetId)) continue; // busy-lock: 1 target/tick
      // Cap đếm bài THẬT đã đăng hôm nay (manual + auto) từ status file — không chỉ
      // slot tick FIRED — để chống spam nền tảng đúng tổng lượng (review R-B F7).
      const postsToday = countPostedToday(slot.targetId, slot.lane, root, nowMs);
      if (postsToday >= maxPerDay) {
        rec({
          event: 'block',
          slotId: slot.slotId,
          jobId: slot.jobId,
          targetId: slot.targetId,
          detail: `cap ${maxPerDay}/ngày (đã đăng ${postsToday} gồm tay+auto)`,
        });
        continue;
      }
      if (!spacingOk(slots, slot.targetId, Date.parse(slot.scheduledAt))) {
        rec({
          event: 'block',
          slotId: slot.slotId,
          jobId: slot.jobId,
          targetId: slot.targetId,
          detail: 'spacing <3h',
        });
        continue;
      }
      if (!rateOk(recentFireMs, nowMs)) {
        rec({ event: 'block', slotId: slot.slotId, jobId: slot.jobId, detail: 'rate-limit' });
        continue;
      }

      const live = fireIsLive(config, slot.platform);
      const cand: Candidate = {
        jobId: slot.jobId as string,
        lane: slot.lane,
        targetId: slot.targetId,
        platform: slot.platform,
        caption: slot.caption ?? '',
      };
      if (!live) {
        // DRY-RUN: log dự định, KHÔNG network, giữ slot BOUND để run thật sau bắn.
        console.log(
          `[tick] 🧪 DRY-RUN would FIRE ${cand.jobId} → ${slot.platform} (${slot.slotId})`,
        );
        rec({
          event: 'fire',
          slotId: slot.slotId,
          jobId: cand.jobId,
          targetId: slot.targetId,
          detail: 'DRY_RUN_PLANNED',
        });
        continue;
      }
      // LIVE
      console.log(`[tick] 🚀 FIRE ${cand.jobId} → ${slot.platform} (${slot.slotId})`);
      const res = await fireViaRoute(cand);
      if (res.ok) {
        slots = replaceSlot(slots, markFired(slot, res.result ?? {}, new Date().toISOString()));
        recentFireMs.push(Date.now());
        firedThisTick.add(slot.targetId);
        rec({
          event: 'fire',
          slotId: slot.slotId,
          jobId: cand.jobId,
          targetId: slot.targetId,
          detail: `LIVE_OK ${res.detail}`,
        });
      } else {
        slots = replaceSlot(
          slots,
          markSkipped(slot, { code: 'FIRE_FAILED', message: res.detail }, new Date().toISOString()),
        );
        rec({
          event: 'skip',
          slotId: slot.slotId,
          jobId: cand.jobId,
          targetId: slot.targetId,
          detail: `LIVE_FAIL ${res.detail}`,
        });
      }
    }

    // PERSIST + BOARD
    writeSchedule(slots, root);
    const upcoming = slots
      .filter((s) => s.state === 'BOUND' || s.state === 'EMPTY')
      .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))
      .slice(0, 12);
    const recent = slots
      .filter((s) => s.state === 'FIRED' || s.state === 'SKIPPED')
      .sort(
        (a, b) =>
          Date.parse(b.firedAt ?? b.skippedAt ?? '') - Date.parse(a.firedAt ?? a.skippedAt ?? ''),
      )
      .slice(0, 12);
    writeBoard(
      {
        schemaVersion: 1,
        generatedAt: nowIso,
        lastTickAt: nowIso,
        halted: false,
        config: {
          master: config.enabled,
          liveTiktok: config.liveTiktok,
          liveFacebook: config.liveFacebook,
          dryRun: !config.enabled || forceDryRun,
        },
        targets: TARGETS.map((t) => ({ targetId: t.targetId, lane: t.lane, platform: t.platform })),
        upcoming,
        recent,
        thisTick: audit,
        // Todo hậu kiểm của Operator (mô hình hậu kiểm — xem trên nền tảng).
        operatorTodos: [
          'TikTok đăng SELF_ONLY tới khi app audit — xem rồi bật public trên app.',
          'FB hiện đăng-ngay (chưa hẹn-giờ native qua route) — round sau nối scheduled.',
        ],
      },
      root,
    );
    rec({ event: 'tick', detail: `bound/fired xong; slots=${slots.length}` });
    console.log(`[tick] ✅ xong — schedule ${slots.length} slot, board cập nhật.`);
  } finally {
    releaseLock(root);
  }
}

main().catch((e) => {
  console.error(`[tick] 🛑 ${e instanceof Error ? e.message : String(e)}`);
  releaseLock();
  process.exit(1);
});
