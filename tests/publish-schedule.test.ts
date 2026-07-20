import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  type PublishSlot,
  type PublishTarget,
  TOKEN_REFRESH_THRESHOLD_MS,
  bindJobToSlot,
  buildDaySlots,
  capOk,
  dueForTikTok,
  ensureSlots,
  fireIsLive,
  firedCountForDay,
  makeSlotId,
  markFired,
  markSkipped,
  missedTikTokWindow,
  needsTokenRefresh,
  nextEmptySlotForTarget,
  parsePublishTickConfig,
  rateOk,
  replaceSlot,
  slotTimeMs,
  spacingOk,
  vnDayKey,
  withinFbScheduleWindow,
} from '../scripts/job-manager/core/publish-schedule.ts';

const H = 60 * 60 * 1000;
const MIN = 60 * 1000;
// 2026-07-19T05:00:00Z == 12:00 giờ VN, ngày 2026-07-19.
const NOW = Date.parse('2026-07-19T05:00:00.000Z');

function ttTarget(over: Partial<PublishTarget> = {}): PublishTarget {
  return {
    targetId: 'tt_review_main',
    lane: 'review',
    platform: 'tiktok',
    slotTimesLocal: ['11:30', '17:30', '20:30'],
    maxPerDay: 3,
    ...over,
  };
}

describe('VN time helpers — deterministic bất kể TZ máy chạy', () => {
  test('vnDayKey trưa VN', () => {
    assert.equal(vnDayKey(NOW), '2026-07-19');
  });
  test('vnDayKey qua ranh giới nửa đêm VN (18:00Z = 01:00 hôm sau VN)', () => {
    assert.equal(vnDayKey(Date.parse('2026-07-19T18:00:00Z')), '2026-07-20');
  });
  test('slotTimeMs quy giờ VN về UTC đúng', () => {
    assert.equal(slotTimeMs('2026-07-19', '11:30'), Date.parse('2026-07-19T04:30:00.000Z'));
    assert.equal(slotTimeMs('2026-07-19', '20:30'), Date.parse('2026-07-19T13:30:00.000Z'));
  });
  test('makeSlotId deterministic', () => {
    assert.equal(
      makeSlotId('tt_review_main', '2026-07-19', '11:30'),
      'tt_review_main__2026-07-19__1130',
    );
  });
});

describe('needsTokenRefresh — quyết định refresh proactive (Phần 82 #2)', () => {
  test('expiresAt thiếu → false (không đoán mù)', () => {
    assert.equal(needsTokenRefresh(undefined, NOW), false);
  });
  test('expiresAt không parse được → false', () => {
    assert.equal(needsTokenRefresh('không-phải-iso', NOW), false);
  });
  test('còn 5h tới hạn (> ngưỡng 2h) → false', () => {
    assert.equal(needsTokenRefresh(new Date(NOW + 5 * H).toISOString(), NOW), false);
  });
  test('còn 1h tới hạn (< ngưỡng 2h) → true', () => {
    assert.equal(needsTokenRefresh(new Date(NOW + 1 * H).toISOString(), NOW), true);
  });
  test('đã quá hạn (âm) → true', () => {
    assert.equal(needsTokenRefresh(new Date(NOW - 1 * H).toISOString(), NOW), true);
  });
  test('đúng biên ngưỡng: còn = threshold → false (strict <)', () => {
    assert.equal(
      needsTokenRefresh(new Date(NOW + TOKEN_REFRESH_THRESHOLD_MS).toISOString(), NOW),
      false,
    );
  });
  test('threshold tuỳ biến', () => {
    assert.equal(needsTokenRefresh(new Date(NOW + 3 * H).toISOString(), NOW, 4 * H), true);
  });
});

describe('buildDaySlots + ensureSlots', () => {
  test('buildDaySlots sinh đúng 3 slot EMPTY', () => {
    const slots = buildDaySlots(ttTarget(), '2026-07-19');
    assert.equal(slots.length, 3);
    assert.ok(slots.every((s) => s.state === 'EMPTY'));
    assert.equal(slots[0].slotId, 'tt_review_main__2026-07-19__1130');
    assert.equal(slots[0].scheduledAt, new Date(Date.parse('2026-07-19T04:30:00Z')).toISOString());
  });
  test('ensureSlots thêm hôm nay + ngày mai, KHÔNG đụng slot đã BOUND', () => {
    const bound: PublishSlot = {
      ...buildDaySlots(ttTarget(), '2026-07-19')[0],
      state: 'BOUND',
      jobId: 'job_x',
    };
    const merged = ensureSlots([bound], [ttTarget()], NOW, 1);
    // 3 (hôm nay) + 3 (mai) = 6 slotId khác nhau; slot bound giữ nguyên state.
    assert.equal(merged.length, 6);
    const stillBound = merged.find((s) => s.slotId === bound.slotId);
    assert.equal(stillBound?.state, 'BOUND');
    assert.equal(stillBound?.jobId, 'job_x');
    // không nhân bản slotId.
    assert.equal(new Set(merged.map((s) => s.slotId)).size, 6);
  });
});

describe('GUARD cap/ngày', () => {
  function firedSlot(firedAtIso: string): PublishSlot {
    return {
      slotId: `s_${firedAtIso}`,
      targetId: 'tt_review_main',
      lane: 'review',
      platform: 'tiktok',
      scheduledAt: firedAtIso,
      state: 'FIRED',
      firedAt: firedAtIso,
    };
  }
  test('đếm đúng số FIRED trong NGÀY VN', () => {
    const slots = [
      firedSlot('2026-07-19T04:30:00Z'), // 11:30 VN 19/7
      firedSlot('2026-07-19T10:30:00Z'), // 17:30 VN 19/7
      firedSlot('2026-07-18T10:30:00Z'), // ngày khác
    ];
    assert.equal(firedCountForDay(slots, 'tt_review_main', NOW), 2);
  });
  test('capOk chặn khi đủ 3', () => {
    const slots = [
      firedSlot('2026-07-19T04:30:00Z'),
      firedSlot('2026-07-19T07:30:00Z'),
      firedSlot('2026-07-19T10:30:00Z'),
    ];
    assert.equal(capOk(slots, 'tt_review_main', NOW, 3), false);
    assert.equal(capOk(slots.slice(0, 2), 'tt_review_main', NOW, 3), true);
  });
});

describe('GUARD spacing / rate', () => {
  test('spacingOk chặn trong 3h, cho phép ngoài 3h', () => {
    const fired: PublishSlot = {
      slotId: 's1',
      targetId: 'tt_review_main',
      lane: 'review',
      platform: 'tiktok',
      scheduledAt: new Date(NOW).toISOString(),
      state: 'FIRED',
      firedAt: new Date(NOW).toISOString(),
    };
    assert.equal(spacingOk([fired], 'tt_review_main', NOW + 2 * H, 3 * H), false);
    assert.equal(spacingOk([fired], 'tt_review_main', NOW + 3 * H + MIN, 3 * H), true);
  });
  test('rateOk chặn khi >= 6 trong 60s', () => {
    const six = [0, 1, 2, 3, 4, 5].map((i) => NOW - i * 1000);
    assert.equal(rateOk(six, NOW, 6, 60_000), false);
    assert.equal(rateOk(six.slice(0, 5), NOW, 6, 60_000), true);
    // ngoài cửa sổ không tính
    assert.equal(rateOk([NOW - 61_000, NOW - 62_000], NOW, 6, 60_000), true);
  });
});

describe('GUARD cửa sổ giờ TikTok / FB', () => {
  const slotAt = (iso: string): PublishSlot => ({
    slotId: 's',
    targetId: 't',
    lane: 'review',
    platform: 'tiktok',
    scheduledAt: iso,
    state: 'BOUND',
  });
  test('dueForTikTok: trong [slot, slot+30min]', () => {
    const s = slotAt(new Date(NOW).toISOString());
    assert.equal(dueForTikTok(s, NOW, 30 * MIN), true);
    assert.equal(dueForTikTok(s, NOW + 30 * MIN, 30 * MIN), true); // biên
    assert.equal(dueForTikTok(s, NOW - MIN, 30 * MIN), false); // chưa tới
    assert.equal(dueForTikTok(s, NOW + 31 * MIN, 30 * MIN), false); // quá cửa
  });
  test('missedTikTokWindow: quá slot+30min', () => {
    const s = slotAt(new Date(NOW).toISOString());
    assert.equal(missedTikTokWindow(s, NOW + 31 * MIN, 30 * MIN), true);
    assert.equal(missedTikTokWindow(s, NOW + 30 * MIN, 30 * MIN), false);
  });
  test('withinFbScheduleWindow: (now+15min, now+24h]', () => {
    const early = slotAt(new Date(NOW + 20 * MIN).toISOString());
    const tooSoon = slotAt(new Date(NOW + 10 * MIN).toISOString());
    const tooFar = slotAt(new Date(NOW + 25 * H).toISOString());
    assert.equal(withinFbScheduleWindow(early, NOW, 15 * MIN, 24 * H), true);
    assert.equal(withinFbScheduleWindow(tooSoon, NOW, 15 * MIN, 24 * H), false);
    assert.equal(withinFbScheduleWindow(tooFar, NOW, 15 * MIN, 24 * H), false);
  });
});

describe('nextEmptySlotForTarget', () => {
  test('chọn slot EMPTY sớm nhất còn trong tương lai/cửa sổ', () => {
    const slots = ensureSlots([], [ttTarget()], NOW, 1);
    // NOW = 12:00 VN 19/7. Slot 11:30 (04:30Z): cửa đóng đúng 05:00Z == NOW → bị loại
    // (bind vào cũng lỡ ngay). Slot sớm nhất còn hợp lệ = 17:30.
    const next = nextEmptySlotForTarget(slots, 'tt_review_main', NOW, 30 * MIN);
    assert.ok(next);
    assert.equal(next?.slotId, 'tt_review_main__2026-07-19__1730');
  });
  test('slot còn trong cửa sổ (mở) vẫn được chọn để bind', () => {
    // now = 04:45Z (11:45 VN) → slot 11:30 (04:30Z) đóng lúc 05:00Z > now → còn chọn được.
    const slots = ensureSlots([], [ttTarget()], NOW, 1);
    const next = nextEmptySlotForTarget(
      slots,
      'tt_review_main',
      Date.parse('2026-07-19T04:45:00Z'),
      30 * MIN,
    );
    assert.equal(next?.slotId, 'tt_review_main__2026-07-19__1130');
  });
  test('bỏ qua slot đã lỡ hẳn, không có EMPTY → null', () => {
    const slots = buildDaySlots(ttTarget(), '2026-07-18'); // toàn bộ hôm qua
    assert.equal(nextEmptySlotForTarget(slots, 'tt_review_main', NOW, 30 * MIN), null);
  });
});

describe('transitions immutably', () => {
  const base = buildDaySlots(ttTarget(), '2026-07-19')[1];
  test('bind → BOUND + jobId/caption, không mutate gốc', () => {
    const b = bindJobToSlot(base, 'job_1', 'cap', '2026-07-19T10:00:00Z');
    assert.equal(b.state, 'BOUND');
    assert.equal(b.jobId, 'job_1');
    assert.equal(b.caption, 'cap');
    assert.equal(base.state, 'EMPTY'); // gốc nguyên
  });
  test('fired → FIRED + result', () => {
    const f = markFired(base, { postId: 'p1' }, '2026-07-19T10:31:00Z');
    assert.equal(f.state, 'FIRED');
    assert.equal(f.result?.postId, 'p1');
  });
  test('skipped → SKIPPED + error', () => {
    const s = markSkipped(base, { code: 'MISSED', message: 'x' }, '2026-07-19T11:00:00Z');
    assert.equal(s.state, 'SKIPPED');
    assert.equal(s.error?.code, 'MISSED');
  });
  test('replaceSlot thay đúng slotId', () => {
    const slots = buildDaySlots(ttTarget(), '2026-07-19');
    const next = markFired(slots[0], { postId: 'p' }, '2026-07-19T04:31:00Z');
    const out = replaceSlot(slots, next);
    assert.equal(out[0].state, 'FIRED');
    assert.equal(out[1].state, 'EMPTY');
  });
});

describe('config phanh 4 tầng — mặc định AN TOÀN', () => {
  test('không set gì → tất cả OFF', () => {
    const c = parsePublishTickConfig({});
    assert.equal(c.enabled, false);
    assert.equal(c.liveTiktok, false);
    assert.equal(c.liveFacebook, false);
  });
  test('fireIsLive: cần master ON + cờ nền tảng', () => {
    const off = parsePublishTickConfig({});
    assert.equal(fireIsLive(off, 'tiktok'), false);
    const masterOnly = parsePublishTickConfig({ VFOS_PUBLISH_TICK: 'on' });
    assert.equal(fireIsLive(masterOnly, 'tiktok'), false); // thiếu cờ nền tảng
    const ttLive = parsePublishTickConfig({ VFOS_PUBLISH_TICK: 'on', TIKTOK_PUBLISH_LIVE: 'true' });
    assert.equal(fireIsLive(ttLive, 'tiktok'), true);
    assert.equal(fireIsLive(ttLive, 'facebook'), false); // FB cần META_MODE=live
    const bothLive = parsePublishTickConfig({
      VFOS_PUBLISH_TICK: 'on',
      TIKTOK_PUBLISH_LIVE: 'true',
      META_MODE: 'live',
    });
    assert.equal(fireIsLive(bothLive, 'facebook'), true);
  });
  test('force dry-run vô hiệu hoá LIVE dù bật đủ cờ', () => {
    const c = parsePublishTickConfig(
      { VFOS_PUBLISH_TICK: 'on', TIKTOK_PUBLISH_LIVE: 'true', META_MODE: 'live' },
      true,
    );
    assert.equal(fireIsLive(c, 'tiktok'), false);
    assert.equal(fireIsLive(c, 'facebook'), false);
  });
});
