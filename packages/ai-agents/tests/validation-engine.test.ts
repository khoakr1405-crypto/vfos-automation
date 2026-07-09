import { describe, expect, it } from 'vitest';
import { enforceWordBudget, normalizeVi, scanClaims, splitSentences } from '../src/index.js';

// Tạo ký tự tàng hình bằng codepoint (source thuần ASCII — KHÔNG chèn char invisible).
const ZWSP = String.fromCodePoint(0x200b); // zero-width space U+200B

describe('normalizeVi (RFC §2.2)', () => {
  it('NFC + strip zero-width + collapse ws + lowercase', () => {
    const out = normalizeVi(`TỐT${ZWSP}  NHẤT`).normalized;
    expect(out).toBe('tốt nhất'.normalize('NFC'));
    expect(out).not.toContain(ZWSP);
  });
});

describe('scanClaims — 5 Test Vàng', () => {
  it('(a) né luật bằng ký tự tàng hình: "cam kết 1<ZWSP>00%" vẫn BLOCKED', () => {
    const evasion = `Sản phẩm này cam kết 1${ZWSP}00% cực đã`;
    // Chứng minh: nếu KHÔNG strip zero-width, số bị cắt → pattern trượt.
    expect(/cam\s*kết\s*\d+\s*%/.test(evasion)).toBe(false);
    const res = scanClaims(evasion);
    expect(res.verdict).toBe('blocked');
    expect(res.violations.map((v) => v.ruleId)).toContain('commit-percent');
  });

  it('(c) đầu vào NFD (dấu tổ hợp) vẫn BLOCKED sau NFC normalize', () => {
    const nfc = 'tốt nhất'.normalize('NFC');
    const nfd = nfc.normalize('NFD');
    expect(nfd).not.toBe(nfc); // chứng minh input thật sự là NFD (khác byte NFC)
    const res = scanClaims(`hàng này ${nfd} luôn ạ`);
    expect(res.verdict).toBe('blocked');
    expect(res.violations.map((v) => v.ruleId)).toContain('superlative-tot-nhat');
  });

  it('(d) vi phạm PHRASE rule "tốt nhất" → blocked + đúng ruleId + matched', () => {
    const res = scanClaims('Đây là sản phẩm tốt nhất thị trường');
    expect(res.verdict).toBe('blocked');
    const hit = res.violations.find((v) => v.ruleId === 'superlative-tot-nhat');
    expect(hit).toBeDefined();
    expect(hit?.matched).toBe('tốt nhất');
  });

  it('(e) vi phạm PATTERN rule "giảm 5kg" → blocked + đúng ruleId', () => {
    const res = scanClaims('Uống vào giảm 5kg sau một tuần');
    expect(res.verdict).toBe('blocked');
    expect(res.violations.map((v) => v.ruleId)).toContain('lose-weight');
  });

  it('text sạch → safe (0 vi phạm)', () => {
    const res = scanClaims('Cái quạt này nhỏ gọn, mình xài thấy ổn nha');
    expect(res.verdict).toBe('safe');
    expect(res.violations).toHaveLength(0);
  });

  it('chỉ soft phrase ("pin trâu cả ngày") → safe_with_warnings', () => {
    const res = scanClaims('Con này pin trâu cả ngày luôn');
    expect(res.verdict).toBe('safe_with_warnings');
  });
});

describe('splitSentences + enforceWordBudget (RFC §2.3)', () => {
  it('(b) KHÔNG tách nhầm câu chứa giá "10.000đ"', () => {
    const lines = splitSentences('Giá chỉ 10.000đ thôi nha.');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('10.000đ');
  });

  it('tách đúng 2 câu tại ". " + chữ hoa (giá 10.000đ vẫn nguyên vẹn)', () => {
    const lines = splitSentences('Giá 10.000đ rẻ lắm. Mua ngay đi bạn ơi.');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('Giá 10.000đ rẻ lắm.');
  });

  it('báo lỗi dòng > 12 từ (subtitle limit)', () => {
    const long = 'một hai ba bốn năm sáu bảy tám chín mười mười-một mười-hai mười-ba.';
    const res = enforceWordBudget(long);
    expect(res).toHaveLength(1);
    expect(res[0]?.count).toBe(13);
    expect(res[0]?.withinLimit).toBe(false);
    expect(res[0]?.max).toBe(12);
  });

  it('PASS dòng <= 12 từ', () => {
    const res = enforceWordBudget('Cái này gọn nhẹ dùng ổn nha.');
    expect(res.every((r) => r.withinLimit)).toBe(true);
  });
});
