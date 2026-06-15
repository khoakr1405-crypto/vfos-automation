import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { buildChineseSearchName, isWeakChineseKeyword } from '../src/lib/cn-search-keywords.ts';
import { isValidChineseKeyword, parseLlmKeywordJson } from '../src/lib/cn-search-llm.ts';

const AO_CHONG_NANG =
  'Áo Chống Nắng Cho Bé UPF50+ Vải Thun Lạnh Mềm Mịn – Áo Khoác Chống Tia UV Cho Bé Trai Bé Gái 6-40kg';

describe('isWeakChineseKeyword (feature-only detector)', () => {
  test('防晒 (feature-only) → weak', () => {
    assert.equal(isWeakChineseKeyword('防晒'), true);
  });
  test('防晒衣 / 儿童防晒衣 / 防晒霜 (có danh từ) → KHÔNG weak', () => {
    assert.equal(isWeakChineseKeyword('防晒衣'), false);
    assert.equal(isWeakChineseKeyword('儿童防晒衣'), false);
    assert.equal(isWeakChineseKeyword('防晒霜'), false);
  });
  test('chuỗi toàn feature ghép (防晒 多功能) → weak; có 1 noun → KHÔNG weak', () => {
    assert.equal(isWeakChineseKeyword('防晒 多功能'), true);
    assert.equal(isWeakChineseKeyword('防晒衣 透气'), false);
  });
  test('rỗng / null → weak (không dùng được)', () => {
    assert.equal(isWeakChineseKeyword(''), true);
    assert.equal(isWeakChineseKeyword(null), true);
    assert.equal(isWeakChineseKeyword(undefined), true);
  });
});

describe('buildChineseSearchName (dictionary, gate mạnh)', () => {
  test('áo chống nắng cho bé → 防晒衣 (KHÔNG ra 防晒)', () => {
    const r = buildChineseSearchName(AO_CHONG_NANG);
    assert.equal(r, '防晒衣');
    assert.equal(isWeakChineseKeyword(r), false);
  });
  test('áo khoác chống nắng nam → null (feature-only, không có danh từ neo)', () => {
    assert.equal(buildChineseSearchName('Áo khoác chống nắng nam'), null);
  });
  test('kem chống nắng → 防晒霜 (noun-specific vẫn đúng)', () => {
    assert.equal(buildChineseSearchName('Kem chống nắng Anessa SPF50'), '防晒霜');
  });
  test('mọi output non-null KHÔNG bao giờ feature-only', () => {
    for (const n of [
      AO_CHONG_NANG,
      'Kem chống nắng',
      'Nồi chiên không dầu 5L',
      'Địu em bé thoáng khí',
    ]) {
      const r = buildChineseSearchName(n);
      if (r !== null) assert.equal(isWeakChineseKeyword(r), false, `weak lọt ra: ${n} → ${r}`);
    }
  });
});

describe('parseLlmKeywordJson (rút gọn + dịch, JSON {vi,zh})', () => {
  test('JSON hợp lệ → {coreVi, zh}', () => {
    const r = parseLlmKeywordJson('{"vi":"Áo chống nắng cho bé UPF50","zh":"儿童防晒衣"}');
    assert.deepEqual(r, { coreVi: 'Áo chống nắng cho bé UPF50', zh: '儿童防晒衣' });
  });
  test('chịu được fence ```json', () => {
    const r = parseLlmKeywordJson('```json\n{"vi":"Áo thun bé","zh":"儿童T恤"}\n```');
    assert.deepEqual(r, { coreVi: 'Áo thun bé', zh: '儿童T恤' });
  });
  test('không phải JSON → null', () => {
    assert.equal(parseLlmKeywordJson('防晒衣'), null);
  });
  test('coreVi rỗng → null', () => {
    assert.equal(parseLlmKeywordJson('{"vi":"","zh":"防晒衣"}'), null);
  });
  test('zh không có Hán (câu tiếng Anh) → null', () => {
    assert.equal(parseLlmKeywordJson('{"vi":"x","zh":"kids sun protection jacket"}'), null);
  });
});

describe('isValidChineseKeyword (sanity)', () => {
  test('cụm Hán ngắn hợp lệ; câu dài/markdown loại', () => {
    assert.equal(isValidChineseKeyword('儿童防晒衣'), true);
    assert.equal(isValidChineseKeyword('这是一个完整的句子，太长了。'), false);
    assert.equal(isValidChineseKeyword('hello'), false);
  });
});
