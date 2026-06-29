// E1 — TITLE-CARD GATE (shared, pure). Tiêu chí DUY NHẤT để cả 03e (chọn hook)
// lẫn 17 (verify post-render) đồng thuận: 1 region OCR là TITLE-CARD Trung khi
// là chữ Hán LỚN ở VÙNG GIỮA/TRÊN khung — KHÁC sub đáy (đã blur, midY > zoneBot)
// và watermark đỉnh (midY < zoneTop). Tách ra để gate↔verify KHÔNG lệch ngưỡng:
// nếu verify dùng ngưỡng khác gate thì sẽ pass cái gate đáng lẽ loại (hoặc ngược lại).
// KHÔNG IO — chỉ logic thuần trên box đã chuẩn hoá theo (fW, fH).

/** 1 vùng chữ do PaddleOCR trả (box axis-aligned pixel [x,y,w,h]). */
export interface OcrRegion {
  box: [number, number, number, number];
  text: string;
  score: number;
}

export const TITLE_GATE = {
  /** TITLE = chữ Trung trong dải dọc [zoneTop, zoneBot] (theo tâm box / fH). */
  zoneTop: 0.12, // < zoneTop = watermark đỉnh → BỎ QUA (không phải title)
  zoneBot: 0.72, // > zoneBot = SUB ĐÁY (chủ ý blur của Operator) → KHÔNG đụng
  /** Title LỚN: bề rộng box ≥ minW*fW (title ngang) HOẶC cao ≥ minH*fH (title dọc). */
  minW: 0.2,
  minH: 0.09, // title dọc thật cao ~0.4; ngưỡng 0.09 loại nhiễu 1-nét cao ~0.045
  /** Conf OCR tối thiểu + tỉ lệ ký tự Hán tối thiểu (loại text Latin/nhiễu). */
  minScore: 0.5,
  minCjkRatio: 0.4,
  /** ≥2 ký tự Hán → title-card thật; loại OCR đọc nhầm 1 nét ("一", mép caption, gợn nước). */
  minCjkChars: 2,
} as const;

// CJK Hán: Ext-A + Unified (khớp range đã dùng trong gate 03e). Giữ nguyên để
// KHÔNG đổi hành vi phân loại title đã hiệu chỉnh.
const CJK = /[㐀-鿿]/;

/** Tỉ lệ ký tự Hán trên tổng ký tự không-trắng (0..1). */
export function cjkRatio(s: string): number {
  const c = [...(s ?? '').replace(/\s/g, '')];
  if (c.length === 0) return 0;
  return c.filter((x) => CJK.test(x)).length / c.length;
}

/** Số ký tự Hán trong chuỗi (để loại nhiễu OCR 1 ký tự). */
export function cjkCharCount(s: string): number {
  let n = 0;
  for (const ch of s ?? '') if (CJK.test(ch)) n += 1;
  return n;
}

/**
 * Region này có phải TITLE-CARD Trung (chữ lớn vùng giữa/trên) không?
 * Loại: text ít Hán, conf thấp, ngoài dải [zoneTop,zoneBot] (watermark đỉnh / sub đáy),
 * hoặc box quá nhỏ (chú thích/nhiễu, không phải title to).
 */
export function isTitleRegion(r: OcrRegion, fW: number, fH: number): boolean {
  const text = r.text ?? '';
  if (cjkCharCount(text) < TITLE_GATE.minCjkChars) return false;
  if (cjkRatio(text) < TITLE_GATE.minCjkRatio) return false;
  if ((r.score ?? 0) < TITLE_GATE.minScore) return false;
  const [, y, w, h] = r.box;
  const midYn = (y + h / 2) / fH;
  if (midYn < TITLE_GATE.zoneTop || midYn > TITLE_GATE.zoneBot) return false;
  return w / fW >= TITLE_GATE.minW || h / fH >= TITLE_GATE.minH;
}

/** Frame có ≥1 region là title-card → frame "dính title". */
export function frameHasTitle(regions: OcrRegion[] | undefined, fW: number, fH: number): boolean {
  return (regions ?? []).some((r) => isTitleRegion(r, fW, fH));
}

/** Region title-card đầu tiên trong frame (để verify log lại text/box bằng chứng). */
export function firstTitleRegion(
  regions: OcrRegion[] | undefined,
  fW: number,
  fH: number,
): OcrRegion | null {
  return (regions ?? []).find((r) => isTitleRegion(r, fW, fH)) ?? null;
}
