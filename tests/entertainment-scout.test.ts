/* =============================================================================
 * VFOS — Trend Scout core (pure logic) — node:test.
 * Mục tiêu: chứng minh lớp thuần của scout đúng, KHÔNG cần browser/mạng:
 *   - parseSearchResponse: 3 shape JSON search API + garbage không throw.
 *   - filterByAge: biên 30/360 phút, thiếu timestamp, timestamp tương lai.
 *   - computeScore: bảng calibration từ bài post (20ph/8k = rất mạnh; 3 ngày/100k = thường).
 *   - dedupeByAwemeId / buildCandidates (sàn l/ph, cờ alreadyJobbed, sort).
 *   - collectJobbedAwemeIds: fixture hermetic, INTAKE_FAILED bị loại, short-link qua cache.
 *   - computeRescanDeltas: Δlike/Δt (schema Round 3 sẵn từ ngày 1).
 *   - renderReportMd: có rank/jobbed marker, không lộ absolute path.
 * KHÔNG chạy Playwright, KHÔNG gọi Douyin thật.
 * Fixtures search-response là SYNTHETIC theo shape đã tài liệu hóa — thay bằng
 * capture thật (ent:scout --dump-raw) sau smoke run đầu tiên.
 * Runner: npx tsx --test tests/entertainment-scout.test.ts
 * ========================================================================== */

import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  type KeywordItem,
  type RawSearchItem,
  type ScoutCandidate,
  type ScoutProductGate,
  type ScoutSnapshot,
  type ScoutThresholds,
  buildCandidates,
  computeFitScore,
  computeRescanDeltas,
  computeScore,
  dedupeByAwemeId,
  evaluateProductGate,
  filterByAge,
  parseSearchResponse,
  renderReportMd,
  resolveComboKeywords,
} from '../scripts/ent-vlog/lib/scout-core.ts';
import {
  collectJobbedAwemeIds,
  extractAwemeIdFromUrl,
} from '../scripts/ent-vlog/lib/scout-jobs-index.ts';

// --- Hằng số test ------------------------------------------------------------

const NOW_MS = 1_752_150_000_000; // mốc cố định — core không tự gọi Date.now()
const T: ScoutThresholds = {
  ageMinMinutes: 30,
  ageMaxMinutes: 360,
  refLikesPerMinute: 400,
  floorLikesPerMinute: 15,
  commentRatioRef: 0.02,
  commentBoostMax: 0.5,
};

/** Item cách đây `ageMin` phút với digg/comment cho trước. */
function item(over: Partial<RawSearchItem> & { ageMin?: number }): RawSearchItem {
  const { ageMin, ...rest } = over;
  return {
    awemeId: '7000000000000000001',
    desc: 'test',
    createTimeSec: ageMin !== undefined ? Math.round(NOW_MS / 1000 - ageMin * 60) : null,
    diggCount: 0,
    commentCount: 0,
    shareCount: 0,
    collectCount: null,
    durationSec: null,
    cover: null,
    author: { uid: null, secUid: null, nickname: null },
    ...rest,
  };
}

// Aweme payload synthetic đúng shape web API đã tài liệu hóa.
function awemePayload(id: string, diggCount: number | string): Record<string, unknown> {
  return {
    aweme_id: id,
    desc: '钓鱼佬的快乐',
    create_time: Math.round(NOW_MS / 1000 - 45 * 60),
    statistics: { digg_count: diggCount, comment_count: 160, share_count: 40, collect_count: 12 },
    video: { duration: 62_000, cover: { url_list: ['https://p3.example/cover.jpg'] } },
    author: { uid: '123', sec_uid: 'MS4wTest', nickname: '渔人' },
  };
}

// --- parseSearchResponse -------------------------------------------------------

describe('parseSearchResponse', () => {
  test('shape A — video tab {data:[{aweme_info}]}', () => {
    const items = parseSearchResponse({ data: [{ aweme_info: awemePayload('71', 8000) }] });
    assert.equal(items.length, 1);
    const it = items[0];
    assert.ok(it);
    assert.equal(it.awemeId, '71');
    assert.equal(it.diggCount, 8000);
    assert.equal(it.durationSec, 62);
    assert.equal(it.author.nickname, '渔人');
    assert.equal(it.cover, 'https://p3.example/cover.jpg');
  });

  test('shape B — general tab (card_unique_name) vẫn parse aweme_info', () => {
    const items = parseSearchResponse({
      data: [{ card_unique_name: 'video', aweme_info: awemePayload('72', 100) }],
    });
    assert.equal(items.length, 1);
    assert.equal(items[0]?.awemeId, '72');
  });

  test('shape C — {aweme_list:[...]}', () => {
    const items = parseSearchResponse({ aweme_list: [awemePayload('73', 5)] });
    assert.equal(items.length, 1);
    assert.equal(items[0]?.awemeId, '73');
  });

  test('coerce số đếm dạng string "8000" → 8000', () => {
    const items = parseSearchResponse({ aweme_list: [awemePayload('74', '8000')] });
    assert.equal(items[0]?.diggCount, 8000);
  });

  test('garbage/null/không đúng shape → [] và không throw', () => {
    for (const bad of [
      null,
      undefined,
      42,
      'x',
      [],
      {},
      { data: 'nope' },
      { aweme_list: [null, 42, { aweme_id: '' }, { aweme_id: 'abc' }] },
    ]) {
      assert.deepEqual(parseSearchResponse(bad), []);
    }
  });

  test('aweme thiếu statistics/create_time → counts 0, createTimeSec null', () => {
    const items = parseSearchResponse({ aweme_list: [{ aweme_id: '75' }] });
    const it = items[0];
    assert.ok(it);
    assert.equal(it.diggCount, 0);
    assert.equal(it.createTimeSec, null);
  });
});

// --- filterByAge ---------------------------------------------------------------

describe('filterByAge', () => {
  test('biên chính xác: 30ph và 360ph nằm TRONG cửa sổ', () => {
    const r = filterByAge([item({ ageMin: 30 }), item({ ageMin: 360 })], NOW_MS, T);
    assert.equal(r.inWindow.length, 2);
  });

  test('29ph → tooNew; 361ph → tooOld; thiếu timestamp → noTimestamp', () => {
    const r = filterByAge([item({ ageMin: 29 }), item({ ageMin: 361 }), item({})], NOW_MS, T);
    assert.equal(r.inWindow.length, 0);
    assert.equal(r.tooNew, 1);
    assert.equal(r.tooOld, 1);
    assert.equal(r.noTimestamp, 1);
  });

  test('timestamp tương lai (age âm) → tooNew, không lọt cửa sổ', () => {
    const r = filterByAge([item({ ageMin: -10 })], NOW_MS, T);
    assert.equal(r.tooNew, 1);
    assert.equal(r.inWindow.length, 0);
  });
});

// --- computeScore (bảng calibration từ bài post) --------------------------------

describe('computeScore — calibration', () => {
  test('20 phút / 8k like → 400 l/ph, vel 1.0, VERY_STRONG, score 100 (không boost)', () => {
    const s = computeScore(item({ ageMin: 20, diggCount: 8000 }), NOW_MS, T);
    assert.equal(s.likesPerMinute, 400);
    assert.equal(s.score, 100);
    assert.ok(s.signals.includes('VERY_STRONG'));
    assert.ok(s.signals.includes('FRESH_LT_60M'));
    assert.match(s.reason, /8k likes sau 20 phút/);
    assert.match(s.reason, /rất mạnh/);
  });

  test('45ph/20k và 120ph/60k đều VERY_STRONG (bảng "viral"/"xu hướng")', () => {
    for (const [age, digg] of [
      [45, 20_000],
      [120, 60_000],
    ] as const) {
      const s = computeScore(item({ ageMin: age, diggCount: digg }), NOW_MS, T);
      assert.ok(s.signals.includes('VERY_STRONG'), `${age}ph/${digg} phải VERY_STRONG`);
      assert.ok(s.score >= 100);
    }
  });

  test('3 ngày / 100k like → điểm thấp, không có tín hiệu mạnh ("bình thường")', () => {
    const s = computeScore(item({ ageMin: 3 * 24 * 60, diggCount: 100_000 }), NOW_MS, T);
    assert.ok(s.score < 10);
    assert.ok(!s.signals.includes('VERY_STRONG'));
    assert.ok(!s.signals.includes('STRONG'));
    assert.ok(!s.signals.includes('WARM'));
  });

  test('comment boost đơn điệu và có trần (capped)', () => {
    const base = computeScore(item({ ageMin: 20, diggCount: 8000, commentCount: 0 }), NOW_MS, T);
    const half = computeScore(item({ ageMin: 20, diggCount: 8000, commentCount: 80 }), NOW_MS, T);
    const full = computeScore(item({ ageMin: 20, diggCount: 8000, commentCount: 160 }), NOW_MS, T);
    const over = computeScore(item({ ageMin: 20, diggCount: 8000, commentCount: 400 }), NOW_MS, T);
    assert.ok(base.score < half.score && half.score < full.score);
    assert.equal(full.score, over.score); // trần commentBoostMax
    assert.equal(full.score, 150); // 100 * (1 + 0.5)
    assert.ok(full.signals.includes('COMMENTS_HOT'));
    assert.ok(!base.signals.includes('COMMENTS_HOT'));
  });

  test('tuổi < 1 phút clamp về 1 (không chia 0/không thổi điểm)', () => {
    const s = computeScore(item({ ageMin: 0, diggCount: 500 }), NOW_MS, T);
    assert.equal(s.likesPerMinute, 500);
    assert.ok(Number.isFinite(s.score));
  });
});

// --- dedupe + buildCandidates ----------------------------------------------------

function kw(i: RawSearchItem, keyword: string): KeywordItem {
  return { ...i, keyword };
}

describe('dedupeByAwemeId / buildCandidates', () => {
  test('cùng aweme_id ở 2 keyword → 1 bản, giữ keyword đầu + số liệu max', () => {
    const a = kw(item({ awemeId: '9', ageMin: 40, diggCount: 100, commentCount: 5 }), 'kw1');
    const b = kw(item({ awemeId: '9', ageMin: 40, diggCount: 150, commentCount: 3 }), 'kw2');
    const out = dedupeByAwemeId([a, b]);
    assert.equal(out.length, 1);
    const only = out[0];
    assert.ok(only);
    assert.equal(only.keyword, 'kw1');
    assert.equal(only.diggCount, 150);
    assert.equal(only.commentCount, 5);
  });

  test('buildCandidates: sàn l/ph loại video yếu, đếm belowFloor', () => {
    const weak = kw(item({ awemeId: '10', ageMin: 60, diggCount: 600 }), 'kw'); // 10 l/ph < 15
    const ok = kw(item({ awemeId: '11', ageMin: 60, diggCount: 6000 }), 'kw'); // 100 l/ph
    const { candidates, rejected } = buildCandidates([weak, ok], NOW_MS, T, new Set());
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.awemeId, '11');
    assert.equal(rejected.belowFloor, 1);
  });

  test('buildCandidates: cờ alreadyJobbed + signal, sort điểm giảm dần, URL canonical', () => {
    const hot = kw(item({ awemeId: '21', ageMin: 40, diggCount: 16_000 }), 'kw');
    const warm = kw(item({ awemeId: '22', ageMin: 120, diggCount: 10_000 }), 'kw');
    const { candidates } = buildCandidates([warm, hot], NOW_MS, T, new Set(['22']));
    assert.deepEqual(
      candidates.map((c) => c.awemeId),
      ['21', '22'],
    );
    const jobbed = candidates.find((c) => c.awemeId === '22');
    assert.ok(jobbed);
    assert.equal(jobbed.alreadyJobbed, true);
    assert.ok(jobbed.signals.includes('ALREADY_JOBBED'));
    assert.equal(jobbed.url, 'https://www.douyin.com/video/22');
    assert.equal(candidates[0]?.alreadyJobbed, false);
  });
});

// --- jobs index (fixture hermetic dưới data/temp — gitignored) -------------------

const FIX_ROOT = fileURLToPath(new URL('../data/temp/scout_test_fixture', import.meta.url));

describe('scout-jobs-index', () => {
  after(() => {
    rmSync(FIX_ROOT, { recursive: true, force: true });
  });

  test('extractAwemeIdFromUrl: canonical + share/video; share-link rút gọn → null', () => {
    assert.equal(extractAwemeIdFromUrl('https://www.douyin.com/video/123'), '123');
    assert.equal(extractAwemeIdFromUrl('https://x/share/video/456?u=1'), '456');
    assert.equal(extractAwemeIdFromUrl('https://v.douyin.com/abc/'), null);
    assert.equal(extractAwemeIdFromUrl(''), null);
  });

  test('collectJobbedAwemeIds: job sống giữ khoá, INTAKE_FAILED loại, short-link qua cache', () => {
    rmSync(FIX_ROOT, { recursive: true, force: true });
    const mk = (dir: string, job: unknown) => {
      mkdirSync(join(FIX_ROOT, dir), { recursive: true });
      writeFileSync(join(FIX_ROOT, dir, 'ent_job.json'), JSON.stringify(job));
    };
    mk('ent_alive_1', {
      state: 'INTAKE_DONE',
      source: { url: 'https://www.douyin.com/video/111' },
    });
    mk('ent_failed_2', {
      state: 'INTAKE_FAILED',
      source: { url: 'https://www.douyin.com/video/222' },
    });
    mk('ent_short_3', { state: 'TIKTOK_POSTED', source: { url: 'https://v.douyin.com/abc/' } });
    mkdirSync(join(FIX_ROOT, 'not_a_job'), { recursive: true });
    writeFileSync(
      join(FIX_ROOT, 'not_a_job', 'ent_job.json'),
      JSON.stringify({ state: 'INTAKE_DONE', source: { url: 'https://www.douyin.com/video/999' } }),
    );
    writeFileSync(
      join(FIX_ROOT, '.source_id_cache.json'),
      JSON.stringify({ 'https://v.douyin.com/abc/': '333' }),
    );

    const ids = collectJobbedAwemeIds(FIX_ROOT);
    assert.deepEqual([...ids].sort(), ['111', '333']);
  });

  test('thư mục không tồn tại / cache hỏng → set rỗng, không throw', () => {
    assert.equal(collectJobbedAwemeIds(join(FIX_ROOT, 'does_not_exist')).size, 0);
  });
});

// --- computeRescanDeltas ----------------------------------------------------------

function candidate(over: Partial<ScoutCandidate>): ScoutCandidate {
  return {
    awemeId: '31',
    url: 'https://www.douyin.com/video/31',
    desc: 'd',
    createdAt: new Date(NOW_MS - 60 * 60_000).toISOString(),
    capturedAt: new Date(NOW_MS).toISOString(),
    ageMinutes: 60,
    diggCount: 1000,
    commentCount: 10,
    shareCount: 1,
    collectCount: null,
    durationSec: null,
    cover: null,
    author: { uid: null, secUid: null, nickname: null },
    keyword: 'kw',
    likesPerMinute: 16.7,
    score: 4.2,
    signals: [],
    reason: 'r',
    alreadyJobbed: false,
    ...over,
  };
}

function snapshot(cands: ScoutCandidate[]): ScoutSnapshot {
  return {
    schemaVersion: 1,
    runId: 'scout_fishing_20260710_090000',
    niche: 'fishing',
    startedAt: new Date(NOW_MS - 10 * 60_000).toISOString(),
    finishedAt: new Date(NOW_MS).toISOString(),
    keywords: ['钓鱼'],
    keywordsCompleted: 1,
    filters: { ageMinMinutes: 30, ageMaxMinutes: 360, sortHint: 'newest' },
    thresholds: T,
    status: 'OK',
    rejectedCounts: {
      tooOld: 0,
      tooNew: 0,
      noTimestamp: 0,
      belowFloor: 0,
      noProductEvidence: 0,
      garbageContent: 0,
    },
    domOnlyIds: [],
    candidates: cands,
  };
}

describe('computeRescanDeltas', () => {
  test('khớp aweme_id → trueLikesPerMinute = Δdigg/Δphút', () => {
    const prev = snapshot([
      candidate({ awemeId: '31', diggCount: 8000, capturedAt: new Date(NOW_MS).toISOString() }),
    ]);
    const curr = [
      candidate({
        awemeId: '31',
        diggCount: 20_000,
        capturedAt: new Date(NOW_MS + 30 * 60_000).toISOString(),
      }),
    ];
    const out = computeRescanDeltas(prev, curr);
    assert.equal(out[0]?.delta?.trueLikesPerMinute, 400); // (20000-8000)/30
    assert.equal(out[0]?.delta?.prevDiggCount, 8000);
  });

  test('candidate mới (không có trong prev) đi qua nguyên vẹn, không delta', () => {
    const out = computeRescanDeltas(snapshot([]), [candidate({ awemeId: '99' })]);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.delta, undefined);
  });

  test('Δt < 1 phút → không gắn delta (mẫu quá gần, nhiễu)', () => {
    const prev = snapshot([candidate({ capturedAt: new Date(NOW_MS).toISOString() })]);
    const out = computeRescanDeltas(prev, [
      candidate({ capturedAt: new Date(NOW_MS + 20_000).toISOString() }),
    ]);
    assert.equal(out[0]?.delta, undefined);
  });
});

// --- VOE product gate + combo keywords (chống rác Trend Scout POV) -----------------

const GATE: ScoutProductGate = {
  productEvidence: ['开箱', '测评', '好物', '神器', '推荐', '3c好物'],
  strongProductActions: ['开箱', '测评'],
  garbageMarkers: ['旅行', '风景', '钓鱼', '搞笑'],
};

describe('evaluateProductGate — Test Vàng chống rác', () => {
  test('phong cảnh thuần (không bằng chứng sản phẩm) → NO_PRODUCT_EVIDENCE', () => {
    const v = evaluateProductGate('海边日落太美了,治愈系风光', GATE);
    assert.deepEqual(v, { pass: false, rejectCode: 'NO_PRODUCT_EVIDENCE' });
  });

  test('đập hộp sản phẩm thật → pass kèm matchedEvidence minh bạch', () => {
    const v = evaluateProductGate('厨房神器开箱,这个真的好用', GATE);
    assert.ok(v.pass);
    assert.ok(v.matchedEvidence.includes('开箱'));
    assert.ok(v.matchedEvidence.includes('神器'));
  });

  test('listicle du lịch có chữ 好物 nhưng KHÔNG có strong action → GARBAGE_CONTENT', () => {
    const v = evaluateProductGate('旅行好物推荐,一起去看世界', GATE);
    assert.deepEqual(v, { pass: false, rejectCode: 'GARBAGE_CONTENT' });
  });

  test('đồ du lịch được ĐẬP HỘP thật (strong action cứu) → pass', () => {
    const v = evaluateProductGate('旅行好物开箱测评,收纳神器', GATE);
    assert.ok(v.pass);
  });

  test('né bằng fullwidth/hoa-thường: NFKC + lowercase vẫn bắt được term', () => {
    // "３ｃ好物" fullwidth + hoa — NFKC gộp về "3c好物".
    const v = evaluateProductGate('３Ｃ好物分享', GATE);
    assert.ok(v.pass);
  });

  test('video câu cá (content lane Giải trí) là rác với lane Review → loại', () => {
    const v = evaluateProductGate('钓鱼佬的快乐,爆护了', GATE);
    assert.deepEqual(v, { pass: false, rejectCode: 'NO_PRODUCT_EVIDENCE' });
    const v2 = evaluateProductGate('钓鱼好物大推荐', GATE);
    assert.deepEqual(v2, { pass: false, rejectCode: 'GARBAGE_CONTENT' });
  });
});

describe('resolveComboKeywords — khóa keyword thả nổi', () => {
  test('cross product [format] × [productTerm], không trùng lặp', () => {
    const out = resolveComboKeywords(['沉浸式开箱', '第一视角测评'], {
      id: 'kitchen-clean',
      label: 'Đồ bếp',
      productTerms: ['厨房神器', '清洁神器'],
    });
    assert.deepEqual(out, [
      '沉浸式开箱 厨房神器',
      '第一视角测评 厨房神器',
      '沉浸式开箱 清洁神器',
      '第一视角测评 清洁神器',
    ]);
    // Mọi query đều chứa product term — KHÔNG còn format đứng một mình.
    assert.ok(out.every((k) => /神器/.test(k)));
  });
});

describe('buildCandidates + VOE gate', () => {
  test('gate chạy TRƯỚC sàn số liệu: rác viral cỡ nào cũng bị loại + đếm đúng lý do', () => {
    const good = kw(
      item({ awemeId: '61', ageMin: 60, diggCount: 6000, desc: '厨房神器开箱' }),
      'k',
    );
    const garbage = kw(
      item({ awemeId: '62', ageMin: 60, diggCount: 60_000, desc: '旅行好物推荐' }),
      'k',
    );
    const scenery = kw(
      item({ awemeId: '63', ageMin: 60, diggCount: 90_000, desc: '海边风景航拍' }),
      'k',
    );
    const { candidates, rejected } = buildCandidates(
      [good, garbage, scenery],
      NOW_MS,
      T,
      new Set(),
      GATE,
    );
    assert.deepEqual(
      candidates.map((c) => c.awemeId),
      ['61'],
    );
    assert.equal(rejected.garbageContent, 1);
    assert.equal(rejected.noProductEvidence, 1);
    assert.ok(candidates[0]?.gateEvidence?.includes('开箱'));
  });

  test('không truyền gate → hành vi cũ nguyên vẹn (lane fishing không bị ảnh hưởng)', () => {
    const scenery = kw(item({ awemeId: '64', ageMin: 60, diggCount: 6000, desc: '风景' }), 'k');
    const { candidates, rejected } = buildCandidates([scenery], NOW_MS, T, new Set());
    assert.equal(candidates.length, 1);
    assert.equal(rejected.noProductEvidence, 0);
    assert.equal(rejected.garbageContent, 0);
    assert.equal(candidates[0]?.gateEvidence, undefined);
    // Fit scoring KHÔNG rò sang chế độ cũ: điểm vẫn thuần viral, không có FIT signal.
    assert.equal(candidates[0]?.monetizationFit, undefined);
    assert.ok(!candidates[0]?.signals.some((s) => s.startsWith('FIT_')));
    assert.equal(candidates[0]?.score, 25); // 100 * (100lpm/400ref) — công thức viral cũ
  });
});

// --- Monetization Fit scoring (vanity metrics KHÔNG quyết định thứ hạng) -----------

describe('Monetization Fit — ưu tiên tuyệt đối video review đồ vật', () => {
  test('review đồ vật ít viral LUÔN xếp trên video bằng chứng yếu mega-viral', () => {
    // Review thật: 2 strong action (开箱+测评) + 神器 → fit 85; chỉ 20 l/ph (viral bonus 1).
    const review = kw(
      item({ awemeId: '71', ageMin: 60, diggCount: 1200, desc: '厨房神器开箱测评' }),
      'k',
    );
    // Bằng chứng yếu nhưng MEGA viral: 1500 l/ph (gấp 75 lần) → fit 20 + viral 20 = 40.
    const megaViral = kw(
      item({ awemeId: '72', ageMin: 60, diggCount: 90_000, desc: '平价好物大推荐' }),
      'k',
    );
    const { candidates } = buildCandidates([megaViral, review], NOW_MS, T, new Set(), GATE);
    assert.deepEqual(
      candidates.map((c) => c.awemeId),
      ['71', '72'], // review đứng trên dù thua viral 75 lần
    );
    const top = candidates[0];
    assert.ok(top);
    assert.equal(top.monetizationFit, 85);
    assert.ok(top.signals.includes('FIT_STRONG'));
    assert.match(top.reason, /Monetization Fit 85\/100/);
    assert.ok(candidates[1]?.signals.includes('FIT_WEAK'));
    // Khoảng trống thiết kế: strong (≥70) không thể bị weak (≤40) + viral (≤20) vượt mặt.
    assert.ok((top.score ?? 0) > (candidates[1]?.score ?? 0));
  });

  test('FIT_STRONG miễn sàn likes/phút (review tốt mới nổi không bị giết); FIT_WEAK chịu sàn', () => {
    const strongButQuiet = kw(
      item({ awemeId: '73', ageMin: 60, diggCount: 300, desc: '收纳神器开箱' }), // 5 l/ph < sàn 15
      'k',
    );
    const weakAndQuiet = kw(
      item({ awemeId: '74', ageMin: 60, diggCount: 300, desc: '平价好物' }), // 5 l/ph < sàn 15
      'k',
    );
    const { candidates, rejected } = buildCandidates(
      [strongButQuiet, weakAndQuiet],
      NOW_MS,
      T,
      new Set(),
      GATE,
    );
    assert.deepEqual(
      candidates.map((c) => c.awemeId),
      ['73'],
    );
    assert.equal(rejected.belowFloor, 1);
  });

  test('computeFitScore: khoảng trống 40↔70 giữa weak và strong là bất khả xâm phạm', () => {
    // Weak tối đa: 4+ evidence không strong → 40.
    assert.deepEqual(computeFitScore([], ['a', 'b', 'c', 'd', 'e']), { fit: 40, tier: 'weak' });
    // Strong tối thiểu: 1 strong, 0 phụ → 70. 70 > 40 + viral trần 20.
    assert.deepEqual(computeFitScore(['开箱'], ['开箱']), { fit: 70, tier: 'strong' });
    // Strong trần: 3 strong + nhiều phụ → cap 100.
    assert.deepEqual(computeFitScore(['a', 'b', 'c'], ['a', 'b', 'c', 'd', 'e', 'f']), {
      fit: 100,
      tier: 'strong',
    });
  });
});

// --- renderReportMd ---------------------------------------------------------------

describe('renderReportMd', () => {
  test('có dòng rank, marker đã-có-job, không lộ absolute path', () => {
    const md = renderReportMd(
      snapshot([
        candidate({ awemeId: '41', score: 150, desc: 'video hot' }),
        candidate({ awemeId: '42', score: 90, alreadyJobbed: true }),
      ]),
      20,
    );
    assert.match(md, /\| 1 \| 150 \|/);
    assert.match(md, /🛑đã có job/);
    assert.match(md, /scout_fishing_20260710_090000/);
    assert.ok(!md.includes('C:\\'));
    assert.ok(!md.includes('C:/'));
    assert.ok(!md.includes('Users/Admin'));
  });

  test('topN cắt đúng số dòng', () => {
    const md = renderReportMd(
      snapshot([candidate({ awemeId: '51' }), candidate({ awemeId: '52' })]),
      1,
    );
    assert.match(md, /\| 1 \|/);
    assert.ok(!/\| 2 \|/.test(md));
  });

  test('gate bật → report hiện ngách con + counters; gate tắt → không nhắc gate', () => {
    const base = snapshot([]);
    const withGate: ScoutSnapshot = {
      ...base,
      subNiche: { id: 'kitchen-clean', label: 'Đồ bếp & dọn nhà' },
      productGateApplied: true,
      rejectedCounts: { ...base.rejectedCounts, noProductEvidence: 3, garbageContent: 2 },
    };
    const md = renderReportMd(withGate, 20);
    assert.match(md, /ngách con: \*\*Đồ bếp & dọn nhà\*\* \(kitchen-clean\)/);
    assert.match(md, /🛡 không-sản-phẩm 3 · rác nội dung 2/);
    const mdOff = renderReportMd(base, 20);
    assert.ok(!mdOff.includes('🛡'));
    assert.ok(!mdOff.includes('ngách con'));
  });
});
