/* =============================================================================
 * Unit test — ManualCsvShopeeConnector (G1 Slice 4, Revenue Attribution §5-C)
 * Chạy: npx tsx --test apps/studio/tests/shopee-connector.test.ts
 * Connector PURE (không fs/network) → test không đụng runtime store thật.
 * ========================================================================== */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { PublishedPost } from '../src/lib/growth-data/types.ts';
import {
  ManualCsvShopeeConnector,
  ShopeeAffiliateApiConnector,
  deriveShopeeSnapshotId,
  shopeeContentKey,
} from '../src/lib/growth-data/shopee/connector.ts';

const posts: PublishedPost[] = [
  {
    publishedPostId: 'pp_job_a',
    jobId: 'job_a',
    channelId: 'ch_fb_review_nha_ban',
    facebookPostId: '111',
    videoId: '111',
    productId: 'item_1',
    affiliateShortLink: 'https://s.shopee.vn/aaa',
    publishedAt: '2026-07-01T00:00:00.000Z',
  },
  // 2 job dùng CHUNG shortLink (case thật: job_20260625_002/003) → partial.
  {
    publishedPostId: 'pp_job_b1',
    jobId: 'job_b1',
    channelId: 'ch_fb_review_nha_ban',
    facebookPostId: '222',
    videoId: '222',
    productId: 'item_2',
    affiliateShortLink: 'https://s.shopee.vn/bbb',
    publishedAt: '2026-07-02T00:00:00.000Z',
  },
  {
    publishedPostId: 'pp_job_b2',
    jobId: 'job_b2',
    channelId: 'ch_fb_review_nha_ban',
    facebookPostId: '333',
    videoId: '333',
    productId: 'item_2b',
    affiliateShortLink: 'https://s.shopee.vn/bbb',
    publishedAt: '2026-07-03T00:00:00.000Z',
  },
];

const connector = new ManualCsvShopeeConnector({ publishedPosts: posts });

describe('ManualCsvShopeeConnector.ingest', () => {
  test('row khớp shortLink → jobId + success', async () => {
    const csv = 'https://s.shopee.vn/aaa,item_1,shop_1,2026-07-01,2026-07-07,10,3,500000,45000,ref1';
    const r = await connector.ingest(csv);
    assert.equal(r.rejected.length, 0);
    assert.equal(r.snapshots.length, 1);
    const s = r.snapshots[0];
    assert.ok(s);
    assert.equal(s.jobId, 'job_a');
    assert.equal(s.ingestStatus, 'success');
    assert.equal(s.commission, 45000);
    assert.equal(s.gmv, 500000);
    assert.equal(s.currency, 'VND');
    assert.equal(s.source, 'manual_csv');
  });

  test('row khớp itemId (không có shortLink) → vẫn attribute được', async () => {
    const csv = ',item_1,shop_1,2026-07-01,2026-07-07,4,1,200000,18000,';
    const r = await connector.ingest(csv);
    assert.equal(r.snapshots[0]?.jobId, 'job_a');
    assert.equal(r.snapshots[0]?.ingestStatus, 'success');
  });

  test('row không khớp → jobId null + unattributed (KHÔNG đoán)', async () => {
    const csv = 'https://s.shopee.vn/zzz,item_zzz,shop_9,2026-07-01,2026-07-07,2,1,99000,9000,';
    const r = await connector.ingest(csv);
    assert.equal(r.snapshots[0]?.jobId, null);
    assert.equal(r.snapshots[0]?.ingestStatus, 'unattributed');
  });

  test('shortLink khớp NHIỀU job → partial, jobId null, note ghi ứng viên', async () => {
    const csv = 'https://s.shopee.vn/bbb,,shop_1,2026-07-01,2026-07-07,6,2,300000,27000,';
    const r = await connector.ingest(csv);
    assert.equal(r.snapshots[0]?.jobId, null);
    assert.equal(r.snapshots[0]?.ingestStatus, 'partial');
    assert.match(r.snapshots[0]?.note ?? '', /job_b1/);
    assert.match(r.snapshots[0]?.note ?? '', /job_b2/);
  });

  test('reject: tiền âm / thập phân / conversions > orderCount / commission > gmv', async () => {
    const csv = [
      'https://s.shopee.vn/aaa,item_1,shop_1,2026-07-01,2026-07-07,10,3,500000,-1,',
      'https://s.shopee.vn/aaa,item_1,shop_1,2026-07-01,2026-07-07,10,3,500000,45000.5,',
      'https://s.shopee.vn/aaa,item_1,shop_1,2026-07-01,2026-07-07,2,5,500000,45000,',
      'https://s.shopee.vn/aaa,item_1,shop_1,2026-07-01,2026-07-07,10,3,1000,45000,',
    ].join('\n');
    const r = await connector.ingest(csv);
    assert.equal(r.snapshots.length, 0);
    assert.equal(r.rejected.length, 4);
  });

  test('reject format tiền VN/exotic: "500.000"→KHÔNG thành 500, "1e3", "0x10"', async () => {
    const csv = [
      'https://s.shopee.vn/aaa,item_1,shop_1,2026-07-01,2026-07-07,10,3,500.000,45000,',
      'https://s.shopee.vn/aaa,item_1,shop_1,2026-07-01,2026-07-07,10,3,500000,1e3,',
      'https://s.shopee.vn/aaa,item_1,shop_1,2026-07-01,2026-07-07,0x10,3,500000,45000,',
    ].join('\n');
    const r = await connector.ingest(csv);
    assert.equal(r.snapshots.length, 0);
    assert.equal(r.rejected.length, 3);
  });

  test('reject lệch cột: dấu phẩy nghìn "500,000" tách cột → KHÔNG nhận tiền sai lặng lẽ', async () => {
    const csv = 'https://s.shopee.vn/aaa,item_1,shop_1,2026-07-01,2026-07-07,10,3,500,000,45000,ref1';
    const r = await connector.ingest(csv);
    assert.equal(r.snapshots.length, 0);
    assert.equal(r.rejected.length, 1);
    assert.match(r.rejected[0]?.reason ?? '', /9-10 cột/);
  });

  test('reject date không phải YYYY-MM-DD (25/06/2026)', async () => {
    const csv = 'https://s.shopee.vn/aaa,item_1,shop_1,25/06/2026,2026-07-07,10,3,500000,45000,';
    const r = await connector.ingest(csv);
    assert.equal(r.snapshots.length, 0);
    assert.equal(r.rejected.length, 1);
  });

  test('2 dòng cùng batch orderRef nhưng KHÁC itemId → 2 snapshotId khác nhau (không nuốt dòng tiền)', async () => {
    const csv = [
      'https://s.shopee.vn/aaa,item_1,shop_1,2026-07-01,2026-07-07,10,3,500000,45000,batch_w27',
      ',item_x,shop_1,2026-07-01,2026-07-07,4,1,200000,18000,batch_w27',
    ].join('\n');
    const r = await connector.ingest(csv);
    assert.equal(r.snapshots.length, 2);
    assert.notEqual(r.snapshots[0]?.snapshotId, r.snapshots[1]?.snapshotId);
  });

  test('dòng data đầu tiên chứa "gmv"/"commission" trong orderRef KHÔNG bị nuốt như header', async () => {
    const csv =
      'https://s.shopee.vn/aaa,item_1,shop_1,2026-07-01,2026-07-07,10,3,500000,45000,export_gmv_commission_w27';
    const r = await connector.ingest(csv);
    assert.equal(r.snapshots.length, 1);
    assert.equal(r.rejected.length, 0);
  });

  test('reject: thiếu cả shortLink lẫn itemId / periodEnd trước periodStart / input rỗng', async () => {
    const r1 = await connector.ingest(',,shop_1,2026-07-01,2026-07-07,1,0,1000,100,');
    assert.equal(r1.rejected.length, 1);
    const r2 = await connector.ingest(
      'https://s.shopee.vn/aaa,item_1,shop_1,2026-07-07,2026-07-01,1,0,1000,100,',
    );
    assert.equal(r2.rejected.length, 1);
    const r3 = await connector.ingest('');
    assert.equal(r3.rejected.length, 1);
    const r4 = await connector.ingest(42);
    assert.equal(r4.rejected.length, 1);
  });

  test('snapshotId deterministic — re-import cùng dòng ⇒ cùng id (idempotent dedupe)', async () => {
    const csv = 'https://s.shopee.vn/aaa,item_1,shop_1,2026-07-01,2026-07-07,10,3,500000,45000,ref1';
    const a = await connector.ingest(csv);
    const b = await connector.ingest(csv);
    assert.equal(a.snapshots[0]?.snapshotId, b.snapshots[0]?.snapshotId);
    assert.equal(
      deriveShopeeSnapshotId({
        jobId: 'job_a',
        periodStart: '2026-07-01',
        periodEnd: '2026-07-07',
        orderRef: 'ref1',
        affiliateShortLink: 'https://s.shopee.vn/aaa',
        itemId: 'item_1',
      }),
      a.snapshots[0]?.snapshotId,
    );
  });

  test('header + comment + dòng trống được bỏ qua', async () => {
    const csv = [
      '# export tuần 27',
      'affiliateShortLink,itemId,shopId,periodStart,periodEnd,orderCount,conversions,gmv,commission,orderRef',
      '',
      'https://s.shopee.vn/aaa,item_1,shop_1,2026-07-01,2026-07-07,10,3,500000,45000,ref1',
    ].join('\n');
    const r = await connector.ingest(csv);
    assert.equal(r.snapshots.length, 1);
    assert.equal(r.rejected.length, 0);
  });
});

describe('shopeeContentKey — định danh dòng tiền độc lập attribution', () => {
  const row = {
    periodStart: '2026-07-01',
    periodEnd: '2026-07-07',
    orderRef: 'batch_t27',
    affiliateShortLink: 'https://s.shopee.vn/aaa',
    itemId: 'item_1',
  };

  test('unattributed → jobId thật: snapshotId ĐỔI nhưng content-key GIỮ NGUYÊN', () => {
    const idBefore = deriveShopeeSnapshotId({ ...row, jobId: null });
    const idAfter = deriveShopeeSnapshotId({ ...row, jobId: 'job_20260617_002' });
    assert.notEqual(idBefore, idAfter);
    assert.equal(shopeeContentKey(idBefore), shopeeContentKey(idAfter));
  });

  test('khác kỳ/khác orderRef → content-key KHÁC (không nuốt nhầm dòng tiền khác)', () => {
    const base = deriveShopeeSnapshotId({ ...row, jobId: null });
    const otherPeriod = deriveShopeeSnapshotId({ ...row, jobId: null, periodEnd: '2026-07-14' });
    const otherRef = deriveShopeeSnapshotId({ ...row, jobId: null, orderRef: 'batch_t28' });
    assert.notEqual(shopeeContentKey(base), shopeeContentKey(otherPeriod));
    assert.notEqual(shopeeContentKey(base), shopeeContentKey(otherRef));
  });

  test('jobId chứa ký tự lạ không phá segment (slug không sinh __)', () => {
    const id = deriveShopeeSnapshotId({ ...row, jobId: 'job__weird--id!!' });
    const plain = deriveShopeeSnapshotId({ ...row, jobId: null });
    assert.equal(shopeeContentKey(id), shopeeContentKey(plain));
  });
});

describe('ShopeeAffiliateApiConnector (stub No-Go #2)', () => {
  test('ingest luôn reject — chưa kích hoạt API thật', async () => {
    const api = new ShopeeAffiliateApiConnector();
    const r = await api.ingest({});
    assert.equal(r.snapshots.length, 0);
    assert.match(r.rejected[0]?.reason ?? '', /No-Go #2/);
  });
});
