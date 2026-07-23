/* =============================================================================
 * Unit test — per-video sub_id + shared-link collision (G1-A read-side)
 * Chạy: npx tsx --test apps/studio/tests/sub-id.test.ts
 * Pure (không fs/network) → không đụng runtime store thật.
 * ========================================================================== */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { deriveVideoSubId, detectAttributionCollisions } from '../src/lib/growth-data/sub-id.ts';

describe('deriveVideoSubId', () => {
  test('jobId thường → vfos<jobId bỏ separator> (tất định)', () => {
    assert.equal(deriveVideoSubId('job_20260625_002'), 'vfosjob20260625002');
    assert.equal(deriveVideoSubId('job_20260625_002'), deriveVideoSubId('job_20260625_002'));
  });

  test('THUẦN chữ-số — ràng buộc CỨNG form Custom Link Shopee VN (không _, không -)', () => {
    const s = deriveVideoSubId('job_20260530_001_unified_test');
    assert.ok(s);
    assert.match(s, /^[a-zA-Z0-9]+$/); // Shopee: "Chỉ được phép nhập giá trị chữ và số"
    assert.equal(s, 'vfosjob20260530001unifiedtest');
  });

  test('2 job KHÁC nhau → sub_id KHÁC nhau (tách được per-video)', () => {
    assert.notEqual(deriveVideoSubId('job_20260625_002'), deriveVideoSubId('job_20260625_003'));
  });

  test('ký tự lạ bị BỎ (không thay bằng _ — sẽ vi phạm charset Shopee)', () => {
    const s = deriveVideoSubId('job/20260625 002!!');
    assert.equal(s, 'vfosjob20260625002');
  });

  test('rỗng / null / chỉ ký tự lạ → null (không sinh sub_id rác)', () => {
    assert.equal(deriveVideoSubId(''), null);
    assert.equal(deriveVideoSubId(null), null);
    assert.equal(deriveVideoSubId(undefined), null);
    assert.equal(deriveVideoSubId('!!!'), null);
  });

  test('cắt ≤ 50 ký tự (jobId dị thường dài không tràn)', () => {
    const s = deriveVideoSubId('x'.repeat(200));
    assert.ok(s);
    assert.ok(s.length <= 50);
  });

  test('GHI NHẬN: 2 jobId chỉ khác separator → CÙNG sub_id (mất thông tin chiều ngược — chấp nhận, jobId thật theo pattern cố định)', () => {
    assert.equal(deriveVideoSubId('job_a_b'), deriveVideoSubId('jobab'));
  });
});

describe('detectAttributionCollisions', () => {
  const row = (jobId: string, link: string | null, productId: string | null = null) => ({
    jobId,
    affiliateShortLink: link,
    productId,
  });

  test('2 video chung shortLink → mỗi bên chỉ ra bên kia', () => {
    const m = detectAttributionCollisions([
      row('job_a', 'https://s.shopee.vn/aaa', 'item_a'),
      row('job_b1', 'https://s.shopee.vn/bbb', 'item_b1'),
      row('job_b2', 'https://s.shopee.vn/bbb', 'item_b2'),
    ]);
    assert.deepEqual(m.get('job_b1'), ['job_b2']);
    assert.deepEqual(m.get('job_b2'), ['job_b1']);
    assert.equal(m.has('job_a'), false); // link + item riêng → không đụng
  });

  test('KHÁC shortLink nhưng CHUNG itemId → vẫn đụng (khớp luật connector OR itemId)', () => {
    const m = detectAttributionCollisions([
      row('j1', 'https://s.shopee.vn/x', 'item_same'),
      row('j2', 'https://s.shopee.vn/y', 'item_same'),
    ]);
    assert.deepEqual(m.get('j1'), ['j2']);
    assert.deepEqual(m.get('j2'), ['j1']);
  });

  test('union 2 khoá: A~B qua link, A~C qua item → A đụng {B,C}', () => {
    const m = detectAttributionCollisions([
      row('A', 'https://s.shopee.vn/link1', 'itemA'),
      row('B', 'https://s.shopee.vn/link1', 'itemB'),
      row('C', 'https://s.shopee.vn/link2', 'itemA'),
    ]);
    assert.deepEqual(m.get('A')?.sort(), ['B', 'C']);
    assert.deepEqual(m.get('B'), ['A']);
    assert.deepEqual(m.get('C'), ['A']);
  });

  test('khoá null/rỗng bỏ qua (chưa có ≠ đụng nhau)', () => {
    const m = detectAttributionCollisions([
      row('job_x', null, null),
      row('job_y', '', ''),
      row('job_z', '  ', '  '),
    ]);
    assert.equal(m.size, 0);
  });

  test('3 video chung 1 link → mỗi bên chỉ ra 2 bên còn lại', () => {
    const m = detectAttributionCollisions([
      row('j1', 'https://s.shopee.vn/z', 'i1'),
      row('j2', 'https://s.shopee.vn/z', 'i2'),
      row('j3', 'https://s.shopee.vn/z', 'i3'),
    ]);
    assert.deepEqual(m.get('j1')?.sort(), ['j2', 'j3']);
    assert.deepEqual(m.get('j2')?.sort(), ['j1', 'j3']);
    assert.deepEqual(m.get('j3')?.sort(), ['j1', 'j2']);
  });

  test('không đụng nhau (link + item đều riêng) → map rỗng', () => {
    const m = detectAttributionCollisions([
      row('j1', 'https://s.shopee.vn/a', 'i1'),
      row('j2', 'https://s.shopee.vn/b', 'i2'),
    ]);
    assert.equal(m.size, 0);
  });

  test('cùng jobId lặp lại cùng khoá → KHÔNG tự báo đụng chính nó', () => {
    const m = detectAttributionCollisions([
      row('j1', 'https://s.shopee.vn/a', 'i1'),
      row('j1', 'https://s.shopee.vn/a', 'i1'),
    ]);
    assert.equal(m.has('j1'), false);
  });
});
