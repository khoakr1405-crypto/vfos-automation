/* =============================================================================
 * Unit test — foldEvidence (G1 Slice 5, precedence-không-sum + null-không-bịa-0)
 * Chạy: npx tsx --test apps/studio/tests/evidence-fold.test.ts
 * foldEvidence PURE (không fs) → test không đụng runtime store thật.
 * ========================================================================== */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { foldEvidence } from '../src/lib/studio-data/evidence-fold.ts';
import type {
  ManualPerformanceSnapshot,
  ShopeeRevenueSnapshot,
} from '../src/lib/growth-data/types.ts';

const manual = (over: Partial<ManualPerformanceSnapshot>): ManualPerformanceSnapshot => ({
  snapshotId: 'm1',
  jobId: 'job_x',
  publishedPostId: null,
  facebookPostId: null,
  channelId: null,
  platform: 'facebook',
  measuredAt: '2026-07-05T00:00:00.000Z',
  views: 0,
  clicks: 0,
  comments: 0,
  reactions: 0,
  shares: 0,
  conversions: 0,
  ctaRole: null,
  source: 'manual',
  ...over,
});

const shopee = (over: Partial<ShopeeRevenueSnapshot>): ShopeeRevenueSnapshot => ({
  snapshotId: 's1',
  jobId: 'job_x',
  affiliateShortLink: 'https://s.shopee.vn/aaa',
  shopId: '1',
  itemId: 'i1',
  periodStart: '2026-07-01',
  periodEnd: '2026-07-07',
  orderCount: 5,
  conversions: 3,
  gmv: 500000,
  commission: 45000,
  currency: 'VND',
  source: 'manual_csv',
  ingestStatus: 'success',
  ...over,
});

describe('foldEvidence — precedence-không-sum (M5)', () => {
  test('manual_csv thắng manual, KHÔNG cộng qua tier; sum trong tier', () => {
    const m = foldEvidence(
      [manual({ snapshotId: 'm1', views: 500, clicks: 40, conversions: 5, revenue: 100000 })],
      [
        shopee({ snapshotId: 's1', commission: 45000 }),
        shopee({ snapshotId: 's2', periodStart: '2026-07-08', periodEnd: '2026-07-14', commission: 30000 }),
      ],
    );
    const e = m.get('job_x');
    assert.equal(e?.revenue, 75000);
    assert.equal(e?.revenueSource, 'manual_csv');
    assert.equal(e?.views, 500);
    assert.equal(e?.clicks, 40);
    assert.equal(e?.conversions, 5);
  });

  test('shopee_affiliate_api thắng manual_csv', () => {
    const m = foldEvidence(
      [],
      [
        shopee({ snapshotId: 's1', commission: 45000 }),
        shopee({ snapshotId: 's2', source: 'shopee_affiliate_api', commission: 40000 }),
      ],
    );
    assert.equal(m.get('job_x')?.revenue, 40000);
    assert.equal(m.get('job_x')?.revenueSource, 'shopee_affiliate_api');
  });

  test('chỉ manual có revenue > 0 → giữ manual + source manual', () => {
    const m = foldEvidence([manual({ revenue: 55000, views: 200 })], []);
    assert.equal(m.get('job_x')?.revenue, 55000);
    assert.equal(m.get('job_x')?.revenueSource, 'manual');
  });
});

describe('foldEvidence — null-không-bịa-0', () => {
  test('job không snapshot nào → KHÔNG có entry (null)', () => {
    const m = foldEvidence([], []);
    assert.equal(m.get('job_x'), undefined);
  });

  test('manual chỉ nhập engagement (revenue 0/undefined) → revenueSource null (không "0 đ đã đo")', () => {
    const m = foldEvidence(
      [manual({ snapshotId: 'm1', views: 100, clicks: 5 }), manual({ snapshotId: 'm2', views: 50, revenue: 0 })],
      [],
    );
    const e = m.get('job_x');
    assert.equal(e?.revenueSource, null);
    assert.equal(e?.revenue, 0);
    assert.equal(e?.snapshotCount, 2);
    assert.equal(e?.views, 150);
  });

  test('job chỉ Shopee → snapshotCount 0 (UI hiển thị "—" cho engagement), revenue thật', () => {
    const m = foldEvidence([], [shopee({ jobId: 'job_y', commission: 20000 })]);
    const e = m.get('job_y');
    assert.equal(e?.snapshotCount, 0);
    assert.equal(e?.views, 0);
    assert.equal(e?.revenue, 20000);
    assert.equal(e?.revenueSource, 'manual_csv');
  });

  test('shopee jobId null (unattributed/partial) bị BỎ QUA — không đoán job', () => {
    const m = foldEvidence([], [shopee({ jobId: null, ingestStatus: 'unattributed' })]);
    assert.equal(m.size, 0);
  });
});

describe('foldEvidence — lastMeasuredAt', () => {
  test('periodEnd date-only normalize cuối ngày → thắng measuredAt sáng cùng ngày', () => {
    const m = foldEvidence(
      [manual({ measuredAt: '2026-07-07T04:00:00.000Z', revenue: 1000 })],
      [shopee({ periodEnd: '2026-07-07' })],
    );
    assert.equal(m.get('job_x')?.lastMeasuredAt, '2026-07-07T23:59:59.999Z');
  });

  test('role-level manual snapshot bị bỏ (tránh double-count)', () => {
    const m = foldEvidence([manual({ ctaRole: 'CAPTION_LINK', views: 999 })], []);
    assert.equal(m.size, 0);
  });
});
