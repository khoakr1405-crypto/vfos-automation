import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { pickProductImageUrl } from '../src/product-image.ts';

const PRODUCT = 'https://down-vn.img.susercontent.com/file/sg-11134201-abc123';
const PRODUCT2 = 'https://cf.shopee.vn/file/deadbeef';
const BADGE =
  'https://deo.shopeemobile.com/shopee/shopee-affiliate-live-vn/static/img/label_xtra_vn.ffa1';
const ICON = 'https://deo.shopeemobile.com/.../icon_flash_sale.png';
const SVG = 'https://example.com/badge.svg';

describe('pickProductImageUrl', () => {
  test('ảnh sản phẩm thật (susercontent /file/) → giữ', () => {
    assert.equal(pickProductImageUrl([PRODUCT]), PRODUCT);
  });

  test('badge label_xtra (lỗi cũ) → null, KHÔNG fallback sang badge', () => {
    assert.equal(pickProductImageUrl([BADGE]), null);
  });

  test('icon / .svg → null', () => {
    assert.equal(pickProductImageUrl([ICON]), null);
    assert.equal(pickProductImageUrl([SVG]), null);
  });

  test('mixed (badge trước, ảnh thật sau) → chọn ảnh thật, bỏ badge', () => {
    assert.equal(pickProductImageUrl([BADGE, ICON, PRODUCT]), PRODUCT);
  });

  test('ưu tiên ảnh CDN sản phẩm hơn URL lạ không-badge', () => {
    const other = 'https://example.com/random/photo123.jpg';
    assert.equal(pickProductImageUrl([other, PRODUCT2]), PRODUCT2);
  });

  test('rỗng / toàn null-undefined → null', () => {
    assert.equal(pickProductImageUrl([]), null);
    assert.equal(pickProductImageUrl([null, undefined, '']), null);
  });

  test('URL có credential/token → null (sanitize loại)', () => {
    assert.equal(
      pickProductImageUrl(['https://x.susercontent.com/file/a?access_token=x']),
      null,
    );
  });

  test('protocol-relative //host → nâng https + giữ', () => {
    const r = pickProductImageUrl(['//down-vn.img.susercontent.com/file/zzz']);
    assert.equal(r, 'https://down-vn.img.susercontent.com/file/zzz');
  });
});
