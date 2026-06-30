/* =============================================================================
 * VFOS — Entertainment ANCHORS data-layer smoke-test — node:test.
 * Mục tiêu: chứng minh anchors engine (đường non-story) còn SỐNG ở tầng dữ liệu:
 *   - deriveAnchors: cluster catch_moments → chọn money-shot anchors (thuần, no fs).
 *   - readAnchorPlan: anchors.json → catch_moments → FALLBACK (ưu tiên đúng thứ tự).
 * KHÔNG render, KHÔNG publish, KHÔNG chạy pipeline, KHÔNG đụng step 10/12/13/15.
 *
 * anchors.ts là module ESM thuần (chỉ node:fs/node:path), không alias '@/' nên
 * import thẳng được — KHÔNG cần TSX_TSCONFIG_PATH như test studio.
 * Runner:
 *   npx tsx --test tests/entertainment-anchors-engine.test.ts
 *
 * Dữ liệu lấy verbatim từ job đã analyze THẬT (ent_fishing_20260625_222949);
 * đã đối chiếu khớp anchors.json + moneyshot_coverage_report.json của job đó.
 * ========================================================================== */

import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  type CatchMoment,
  DEFAULT_MAX_ANCHORS,
  DEFAULT_MIN_ANCHORS,
  FALLBACK_ANCHORS,
  deriveAnchors,
  readAnchorPlan,
} from '../scripts/ent-vlog/lib/anchors.ts';

// --- Dữ liệu THẬT (copy verbatim từ ent_fishing_20260625_222949) -------------
const REAL_MOMENTS: CatchMoment[] = [
  { tSec: 199.5, score: 10, what: 'Cá được cầm giơ lên rõ ràng.' },
  { tSec: 318.5, score: 10, what: 'Cá lớn đang được giơ lên rõ ràng.' },
  { tSec: 353.5, score: 10, what: 'Cá được giơ lên rõ ràng.' },
  { tSec: 367.5, score: 8, what: 'Cá nằm trên ván chèo.' },
  { tSec: 437.5, score: 10, what: 'Cá nằm trên ván, rõ ràng' },
];
const EXPECTED_ANCHORS = [199.5, 318.5, 353.5, 437.5];
const REAL_DURATION = 449.17;

function isStrictlyAscending(arr: number[]): boolean {
  for (let i = 1; i < arr.length; i++) {
    const prev = arr[i - 1];
    const cur = arr[i];
    if (prev === undefined || cur === undefined || cur <= prev) return false;
  }
  return true;
}

// --- Fixture hermetic dưới data/temp/ent (gitignored) ------------------------
const FIX_ROOT = fileURLToPath(new URL('../data/temp/ent', import.meta.url));
const createdDirs: string[] = [];

function mkFix(name: string): string {
  const dir = join(FIX_ROOT, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  createdDirs.push(dir);
  return dir;
}

after(() => {
  for (const d of createdDirs) rmSync(d, { recursive: true, force: true });
});

describe('deriveAnchors — money-shot từ catch_moments (dữ liệu thật)', () => {
  test('5 moments thật → anchors đúng [199.5, 318.5, 353.5, 437.5]', () => {
    const { anchors } = deriveAnchors(REAL_MOMENTS);
    // 353.5 + 367.5 cách 14 ≤ minGap(lead14+reaction9=23) → gộp, giữ score cao (353.5).
    assert.deepEqual(anchors, EXPECTED_ANCHORS);
  });

  test('số anchors nằm trong [MIN, MAX]', () => {
    const { anchors } = deriveAnchors(REAL_MOMENTS);
    assert.ok(anchors.length >= DEFAULT_MIN_ANCHORS, `>= ${DEFAULT_MIN_ANCHORS}`);
    assert.ok(anchors.length <= DEFAULT_MAX_ANCHORS, `<= ${DEFAULT_MAX_ANCHORS}`);
  });

  test('anchors tăng dần, không âm, max < duration thật', () => {
    const { anchors } = deriveAnchors(REAL_MOMENTS);
    assert.ok(isStrictlyAscending(anchors), 'phải tăng dần');
    assert.ok(
      anchors.every((a) => a >= 0),
      'không âm',
    );
    const max = Math.max(...anchors);
    assert.ok(max < REAL_DURATION, `max ${max} < duration ${REAL_DURATION}`);
  });

  test('anchors thật KHÁC FALLBACK_ANCHORS (không rơi vào hardcode)', () => {
    const { anchors } = deriveAnchors(REAL_MOMENTS);
    assert.notDeepEqual(anchors, FALLBACK_ANCHORS);
  });

  test('>6 moments cách xa → giữ top-6 theo score rồi sort theo thời gian', () => {
    const many: CatchMoment[] = [
      { tSec: 10, score: 5 },
      { tSec: 40, score: 9 },
      { tSec: 70, score: 10 },
      { tSec: 100, score: 6 },
      { tSec: 130, score: 8 },
      { tSec: 160, score: 10 },
      { tSec: 190, score: 7 },
      { tSec: 220, score: 4 },
    ];
    const { anchors } = deriveAnchors(many);
    assert.equal(anchors.length, DEFAULT_MAX_ANCHORS);
    // Bị loại: 10(score5) và 220(score4) — 2 score thấp nhất.
    assert.deepEqual(anchors, [40, 70, 100, 130, 160, 190]);
    assert.ok(!anchors.includes(10), '10 (score thấp) bị loại');
    assert.ok(!anchors.includes(220), '220 (score thấp) bị loại');
    assert.ok(isStrictlyAscending(anchors), 'kết quả vẫn sort theo thời gian');
  });

  test('empty moments → trả [] (KHÔNG tự fallback — đó là việc của readAnchorPlan)', () => {
    const { anchors } = deriveAnchors([]);
    assert.deepEqual(anchors, []);
  });
});

describe('readAnchorPlan — ưu tiên anchors.json → catch_moments → fallback', () => {
  test('có anchors.json → đọc đúng, KHÔNG fallback hardcode', () => {
    const dir = mkFix('ent_anchors_smoke_json');
    writeFileSync(
      join(dir, 'anchors.json'),
      JSON.stringify({ anchors: EXPECTED_ANCHORS, lead: 14, reaction: 9, source: 'catch_moments' }),
    );
    const plan = readAnchorPlan(dir);
    assert.deepEqual(plan.anchors, EXPECTED_ANCHORS);
    assert.notEqual(plan.source, 'fallback-hardcoded');
    assert.notDeepEqual(plan.anchors, FALLBACK_ANCHORS);
  });

  test('chỉ có catch_moments.json → derive đúng anchors, source = catch_moments', () => {
    const dir = mkFix('ent_anchors_smoke_catch');
    writeFileSync(
      join(dir, 'catch_moments.json'),
      JSON.stringify({ videoId: 'fixture', durationSec: REAL_DURATION, moments: REAL_MOMENTS }),
    );
    const plan = readAnchorPlan(dir);
    assert.deepEqual(plan.anchors, EXPECTED_ANCHORS);
    assert.equal(plan.source, 'catch_moments');
    assert.notDeepEqual(plan.anchors, FALLBACK_ANCHORS);
  });

  test('không có file nào → FALLBACK_ANCHORS, source = fallback-hardcoded', () => {
    const dir = mkFix('ent_anchors_smoke_empty');
    const plan = readAnchorPlan(dir);
    assert.deepEqual(plan.anchors, FALLBACK_ANCHORS);
    assert.equal(plan.source, 'fallback-hardcoded');
  });

  test('anchors.json rỗng (anchors:[]) → fallthrough sang catch_moments', () => {
    const dir = mkFix('ent_anchors_smoke_emptyarr');
    writeFileSync(join(dir, 'anchors.json'), JSON.stringify({ anchors: [] }));
    writeFileSync(join(dir, 'catch_moments.json'), JSON.stringify({ moments: REAL_MOMENTS }));
    const plan = readAnchorPlan(dir);
    assert.deepEqual(plan.anchors, EXPECTED_ANCHORS);
    assert.equal(plan.source, 'catch_moments');
  });

  test('anchors.json hỏng JSON → fallthrough sang catch_moments', () => {
    const dir = mkFix('ent_anchors_smoke_badjson');
    writeFileSync(join(dir, 'anchors.json'), '{ this is not valid json');
    writeFileSync(join(dir, 'catch_moments.json'), JSON.stringify({ moments: REAL_MOMENTS }));
    const plan = readAnchorPlan(dir);
    assert.deepEqual(plan.anchors, EXPECTED_ANCHORS);
    assert.equal(plan.source, 'catch_moments');
  });
});
