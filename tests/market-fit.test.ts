import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  MARKET_FIT_MIN_CONFIDENCE,
  type MarketFitSuggestion,
  assessMarketFit,
  buildAutoMarketFitCard,
  parseMarketFitSuggestion,
} from '../scripts/job-manager/core/market-fit.ts';

const GOOD: MarketFitSuggestion = {
  mainProductVisible: true,
  productNameVi: 'Kệ gia vị nam châm dán tủ lạnh',
  keywords: ['kệ nam châm', 'kệ gia vị tủ lạnh', 'kệ dán tủ lạnh'],
  chineseSearchName: '冰箱置物架',
  category: 'đồ gia dụng nhà bếp',
  isPhysicalProduct: true,
  likelyOnTikTokShopVN: true,
  confidence: 0.9,
  reason: 'Kệ gia dụng là hàng phổ thông bán rất nhiều trên TikTok Shop VN.',
};

describe('market-fit: parse suggestion từ LLM', () => {
  test('shape đầy đủ → parse được, keywords lọc chuỗi rỗng', () => {
    const s = parseMarketFitSuggestion({
      ...GOOD,
      keywords: ['kệ nam châm', '', 42, 'kệ gia vị'],
    });
    assert.ok(s);
    assert.equal(s.productNameVi, GOOD.productNameVi);
    assert.deepEqual(s.keywords, ['kệ nam châm', 'kệ gia vị']);
  });

  test('thiếu field bắt buộc / sai kiểu → null (fail loud, không bịa)', () => {
    assert.equal(parseMarketFitSuggestion(null), null);
    assert.equal(parseMarketFitSuggestion({ ...GOOD, isPhysicalProduct: 'yes' }), null);
    assert.equal(parseMarketFitSuggestion({ ...GOOD, likelyOnTikTokShopVN: undefined }), null);
    assert.equal(parseMarketFitSuggestion({ ...GOOD, productNameVi: 'ab' }), null); // < 3 ký tự
    assert.equal(parseMarketFitSuggestion({ ...GOOD, confidence: 1.5 }), null);
    assert.equal(parseMarketFitSuggestion({ ...GOOD, confidence: Number.NaN }), null);
  });
});

describe('market-fit: verdict tự duyệt', () => {
  test('Test Vàng kệ nam châm — sản phẩm gia dụng rõ ràng → PASS', () => {
    const v = assessMarketFit(GOOD);
    assert.equal(v.pass, true);
  });

  test('không phải sản phẩm vật lý (dịch vụ/địa điểm) → FAIL', () => {
    const v = assessMarketFit({ ...GOOD, isPhysicalProduct: false });
    assert.equal(v.pass, false);
    assert.match(v.reason, /vật lý/);
  });

  test('loại hàng không bán trên TikTok Shop VN → FAIL', () => {
    const v = assessMarketFit({
      ...GOOD,
      likelyOnTikTokShopVN: false,
      reason: 'Động vật sống không được bán trên sàn.',
    });
    assert.equal(v.pass, false);
    assert.match(v.reason, /TikTok Shop/);
  });

  test('không thấy sản phẩm chính → FAIL', () => {
    const v = assessMarketFit({ ...GOOD, mainProductVisible: false });
    assert.equal(v.pass, false);
  });

  test('biên confidence: đúng ngưỡng 0.6 → PASS; dưới ngưỡng → FAIL', () => {
    assert.equal(assessMarketFit({ ...GOOD, confidence: MARKET_FIT_MIN_CONFIDENCE }).pass, true);
    assert.equal(assessMarketFit({ ...GOOD, confidence: 0.59 }).pass, false);
  });
});

describe('market-fit: card AUTO_MARKET_FIT', () => {
  test('card đúng platform/status, KHÔNG mang field Shopee, KHÔNG link', () => {
    const card = buildAutoMarketFitCard(GOOD, assessMarketFit(GOOD), 'job_20260716_099', 'T0');
    assert.equal(card.platform, 'tiktok-shop');
    assert.equal(card.validationStatus, 'AUTO_MARKET_FIT');
    assert.equal(card.name, GOOD.productNameVi);
    assert.equal(card.id, 'auto_tt_job_20260716_099');
    // Không được mang identity Shopee / link — link TikTok Shop là khâu sau.
    assert.equal('affiliateOwnerId' in card, false);
    assert.equal('shortLink' in card, false);
    assert.equal('shopId' in card, false);
    assert.equal('itemId' in card, false);
    assert.equal('tiktokShopUrl' in card, false);
  });
});
