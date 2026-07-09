import { countWords } from '@vfos/script-writer';
import { describe, expect, it } from 'vitest';
import { chunkForSubtitles } from '../src/index.js';

describe('chunkForSubtitles (RFC §2.3 — cắt phụ đề ≤12 từ)', () => {
  it('TEST VÀNG: câu >30 từ có dấu phẩy + liên từ + giá "10.000đ" → mọi dòng ≤12 từ, không vỡ nghĩa', () => {
    const long =
      'Chiếc áo khoác này không chỉ chống nắng cực tốt mà còn siêu nhẹ và thoáng mát, giá thì chỉ 10.000đ một cái thôi, nên bạn hãy nhanh tay đặt hàng ngay hôm nay để không bỏ lỡ ưu đãi cực hời này nhé.';
    expect(countWords(long)).toBeGreaterThan(30);

    const chunks = chunkForSubtitles(long);

    // (1) cắt ra thành nhiều dòng
    expect(chunks.length).toBeGreaterThan(1);
    // (2) MỌI dòng ≤ 12 từ
    for (const line of chunks) {
      expect(countWords(line)).toBeLessThanOrEqual(12);
    }
    // (3) giá "10.000đ" còn nguyên vẹn trên đúng 1 dòng
    const priceLines = chunks.filter((c) => c.includes('10.000đ'));
    expect(priceLines).toHaveLength(1);
    // (4) bất biến: không mất/không thêm từ (ghép lại = câu gốc)
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(long.replace(/\s+/g, ' '));
  });

  it('KHÔNG chẻ giữa "UPF" và "50+" (nhãn ↔ giá trị)', () => {
    const s =
      'Áo được dệt từ sợi cao cấp với chỉ số chống tia UV đạt chuẩn UPF 50+ nên bạn hoàn toàn yên tâm khi đi biển hay dạo phố dưới trời nắng gắt nhé.';
    const chunks = chunkForSubtitles(s);
    for (const line of chunks) expect(countWords(line)).toBeLessThanOrEqual(12);
    // "UPF" và "50+" phải nằm cùng 1 dòng, liền nhau
    const upfLine = chunks.find((c) => c.includes('UPF'));
    expect(upfLine).toBeDefined();
    expect(upfLine).toContain('UPF 50+');
  });

  it('chẻ tại dấu chấm phẩy ";"', () => {
    const s = 'Sản phẩm này rất bền và đẹp; giá lại vô cùng phải chăng cho mọi người dùng.';
    const chunks = chunkForSubtitles(s);
    for (const line of chunks) expect(countWords(line)).toBeLessThanOrEqual(12);
    // có 1 dòng kết thúc ngay tại ";" (ngắt sau chấm phẩy)
    expect(chunks.some((c) => c.trimEnd().endsWith(';'))).toBe(true);
  });

  it('giữ nguyên "45.000 đồng" (số + đơn vị chữ tách rời) khi chẻ', () => {
    const s =
      'Sản phẩm này siêu tiết kiệm chỉ với 45.000 đồng thôi mà chất lượng thì khỏi bàn luôn nha các bạn ơi.';
    const chunks = chunkForSubtitles(s);
    for (const line of chunks) expect(countWords(line)).toBeLessThanOrEqual(12);
    expect(chunks.some((c) => c.includes('45.000 đồng'))).toBe(true);
  });

  it('câu ≤ 12 từ giữ nguyên thành đúng 1 dòng', () => {
    const s = 'Cái áo này mặc mát lắm nha.';
    expect(chunkForSubtitles(s)).toEqual([s]);
  });

  it('nhiều câu: xử lý độc lập từng câu, mọi dòng ≤ 12 từ', () => {
    const s =
      'Áo này đẹp lắm. Nó được bán với giá chỉ 99.000 VNĐ, một cái giá quá hời cho một sản phẩm chất lượng cao như vậy đó nha.';
    const chunks = chunkForSubtitles(s);
    for (const line of chunks) expect(countWords(line)).toBeLessThanOrEqual(12);
    expect(chunks[0]).toBe('Áo này đẹp lắm.');
    expect(chunks.some((c) => c.includes('99.000 VNĐ'))).toBe(true);
  });

  it('câu dài không dấu ngắt/liên từ vẫn bị chẻ cứng ≤ 12 từ', () => {
    const s =
      'một hai ba bốn năm sáu bảy tám chín mười mười-một mười-hai mười-ba mười-bốn mười-lăm mười-sáu.';
    const chunks = chunkForSubtitles(s);
    expect(chunks.length).toBeGreaterThan(1);
    for (const line of chunks) expect(countWords(line)).toBeLessThanOrEqual(12);
  });

  it('chuỗi rỗng → []', () => {
    expect(chunkForSubtitles('   ')).toEqual([]);
  });
});
