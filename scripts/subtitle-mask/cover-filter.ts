/* =============================================================================
 * VFOS — Source-subtitle COVER filter builder (pure, testable)
 * -----------------------------------------------------------------------------
 * Từ mask (đoạn phụ đề + box chuẩn hoá 0–1) → sinh chuỗi FFmpeg filter_complex
 * che/xóa chữ Trung theo ĐÚNG box, ĐÚNG thời điểm (enable=between).
 *   - delogo  : XÓA (nội suy nền) — sạch với dòng phụ đề mỏng.
 *   - blur    : che mềm (split+crop+boxblur+overlay) — cho khối chữ cao/nền rối.
 *   - solid   : dải đặc (drawbox fill) — fallback chắc nhất.
 *   - auto    : delogo nếu box mỏng (h ≤ delogoMaxHeight), ngược lại blur.
 * KHÔNG IO — caption renderer nối thêm `subtitles=` rồi map output.
 * ========================================================================== */

import type { NormBox, SubtitleSegment } from './detect-core.js';

export type CoverMode = 'auto' | 'delogo' | 'blur' | 'solid' | 'off';
export type ResolvedMode = 'delogo' | 'blur' | 'solid';

export interface CoverOptions {
  mode: CoverMode;
  /** TRẦN chiều cao: bỏ box cao hơn ngưỡng này (khối to/nhiều dòng). Tỉ lệ H 0..1. */
  maxLineHeight: number;
  /** Tỉ lệ ngang/dọc TỐI THIỂU (w/h) để coi là DÒNG phụ đề. Phụ đề = rộng & thấp;
   * logo/khối = vuông/cao (tỉ lệ thấp) → loại. Phân biệt bằng FORM, không bằng h tuyệt đối. */
  minAspectRatio: number;
  /** Thống nhất bề rộng theo DẢI: cover = bề rộng phủ hết các dòng THẬT trong dải
   * (≈ dòng dài nhất) + pad nhỏ, CANH GIỮA theo tâm box OCR — KHÔNG full-width.
   * Đoạn OCR hẹp vẫn dùng width chuẩn → không lòi chữ 2 bên. Workflow default BẬT. */
  unifyBandWidth: boolean;
  /** KẸP an toàn: bề rộng cover không vượt tỉ lệ này của khung (vd 0.88 ~ 88%). */
  maxBandWidth: number;
  /** Pad NHỎ thêm mỗi bên cho dải đã thống nhất (tỉ lệ W). */
  bandSidePad: number;
  /** Nới NGANG mỗi bên cho chế độ per-box (unifyBandWidth=false). Tỉ lệ W. */
  padXPct: number;
  /** Nới DỌC mỗi phía — NHỎ, để vùng xóa chỉ vừa cao hơn chữ một chút. Tỉ lệ H. */
  padYPct: number;
  /** 'auto': delogo nếu box.h ≤ ngưỡng này, ngược lại blur (sau khi đã lọc maxLineHeight). */
  delogoMaxHeight: number;
  /** Cường độ boxblur cho mode blur. */
  blurStrength: number;
}

export const DEFAULT_COVER: CoverOptions = {
  mode: 'delogo',
  maxLineHeight: 0.16,
  minAspectRatio: 2.5,
  unifyBandWidth: true,
  maxBandWidth: 0.88,
  bandSidePad: 0.02,
  padXPct: 0.07,
  padYPct: 0.006,
  delogoMaxHeight: 0.1,
  blurStrength: 18,
};

/**
 * Chọn mode thực thi cho 1 segment. 'auto' → theo CHIỀU CAO box: delogo nội suy
 * theo span dọc, nên dòng phụ đề mỏng (h ≤ delogoMaxHeight) → delogo (xóa sạch như
 * hình mẫu); khối chữ cao hơn → blur (tránh lem). Mode ép → giữ nguyên.
 */
export function pickSegmentMode(
  boxHeight: number,
  mode: CoverMode,
  delogoMaxHeight: number,
): ResolvedMode {
  if (mode === 'delogo' || mode === 'blur' || mode === 'solid') return mode;
  return boxHeight <= delogoMaxHeight ? 'delogo' : 'blur';
}

function round(n: number, d = 4): number {
  return Number(n.toFixed(d));
}

interface PixelRect {
  px: number;
  py: number;
  pw: number;
  ph: number;
}

/**
 * Nới box (NGANG padXPct, DỌC padYPct — bất đối xứng) rồi đổi sang PIXEL nguyên
 * theo W×H. delogo/drawbox/crop yêu cầu số nguyên (delogo KHÔNG nhận biểu thức
 * iw*..). Giữ biên ≥1px mọi phía để delogo nội suy được (cần x≥1, x+w≤W-1).
 */
function padToPixels(
  box: NormBox,
  padXPct: number,
  padYPct: number,
  W: number,
  H: number,
): PixelRect {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  let px = Math.round((box.x - padXPct) * W);
  let py = Math.round((box.y - padYPct) * H);
  let pw = Math.round((box.w + padXPct * 2) * W);
  let ph = Math.round((box.h + padYPct * 2) * H);
  px = clamp(px, 1, W - 3);
  py = clamp(py, 1, H - 3);
  pw = clamp(pw, 2, W - 1 - px);
  ph = clamp(ph, 2, H - 1 - py);
  return { px, py, pw, ph };
}

function between(startSec: number, endSec: number): string {
  return `enable='between(t,${round(startSec, 3)},${round(endSec, 3)})'`;
}

export interface SegmentPlan {
  index: number;
  mode: ResolvedMode;
  startSec: number;
  endSec: number;
  rect: PixelRect;
}

export interface CoverChain {
  /** Chuỗi filter_complex (nhiều stage `;`-nối) biến [0:v] → lastLabel. */
  chain: string;
  /** Nhãn output cuối (caption renderer nối `subtitles=` vào đây). */
  lastLabel: string;
  perSegment: SegmentPlan[];
}

/** Khoảng cách tâm-y tối đa để gộp các đoạn vào CÙNG dải phụ đề (tỉ lệ H). */
const FULL_BAND_Y_TOL = 0.05;

function median(values: number[]): number {
  const a = [...values].sort((x, y) => x - y);
  const n = a.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? (a[(n - 1) / 2] as number) : ((a[n / 2 - 1] as number) + (a[n / 2] as number)) / 2;
}

/**
 * Thống nhất bề rộng theo DẢI (gom theo tâm-y). Mỗi dải:
 *   - width = bề rộng phủ HẾT các dòng THẬT (frames>0) trong dải (≈ dòng dài nhất)
 *     + pad nhỏ 2 bên, KẸP ≤ maxBandWidth (KHÔNG full-frame).
 *   - x = canh giữa theo tâm (left+right)/2 của các box thật, kẹp trong khung.
 *   - y/h = median band (mỏng, ổn định, không nhảy theo từng frame OCR).
 * Mọi đoạn trong dải (kể cả bridge/đoạn OCR hẹp) dùng CHUNG box chuẩn này →
 * không lòi chữ 2 bên. OCR chỉ định Y/H + bề rộng/vị trí dải.
 */
function toUnifiedBands(
  lines: readonly SubtitleSegment[],
  maxH: number,
  maxBandWidth: number,
  sidePad: number,
): SubtitleSegment[] {
  const bands: SubtitleSegment[][] = [];
  for (const s of [...lines].sort((a, b) => a.box.y + a.box.h / 2 - (b.box.y + b.box.h / 2))) {
    const mid = s.box.y + s.box.h / 2;
    let band = bands.find((b) =>
      b.some((m) => Math.abs(m.box.y + m.box.h / 2 - mid) <= FULL_BAND_Y_TOL),
    );
    if (!band) {
      band = [];
      bands.push(band);
    }
    band.push(s);
  }
  const out: SubtitleSegment[] = [];
  for (const band of bands) {
    const reals = band.filter((s) => s.frames > 0);
    const basis = reals.length > 0 ? reals : band;
    const left = Math.min(...basis.map((s) => s.box.x));
    const right = Math.max(...basis.map((s) => s.box.x + s.box.w));
    const centerX = (left + right) / 2;
    const stableMid = median(basis.map((s) => s.box.y + s.box.h / 2));
    const stableH = Math.min(maxH, median(basis.map((s) => s.box.h)));
    const w = Math.min(maxBandWidth, right - left + sidePad * 2);
    const x = Math.min(Math.max(0, centerX - w / 2), 1 - w);
    const box: NormBox = {
      x: Number(x.toFixed(4)),
      y: Number(Math.max(0, stableMid - stableH / 2).toFixed(4)),
      w: Number(w.toFixed(4)),
      h: Number(stableH.toFixed(4)),
    };
    for (const s of band) out.push({ ...s, box: { ...box } });
  }
  return out.sort((a, b) => a.startSec - b.startSec);
}

/**
 * Sinh cover chain (PIXEL theo W×H — delogo cần số nguyên). Trả null nếu mode
 * 'off' hoặc không có segment. Mỗi segment 1 stage có nhãn riêng; blur dùng
 * split/overlay, delogo/solid là filter tuyến tính. Đều timed `enable=between`.
 */
export function buildCoverChain(
  segments: readonly SubtitleSegment[],
  videoWidth: number,
  videoHeight: number,
  opts: CoverOptions = DEFAULT_COVER,
): CoverChain | null {
  if (opts.mode === 'off' || videoWidth < 4 || videoHeight < 4) return null;

  // Giữ DÒNG phụ đề (rộng & thấp) qua TỈ LỆ w/h + trần chiều cao; bỏ logo/khối
  // (vuông/cao) — phân biệt bằng FORM, không bằng chiều cao tuyệt đối.
  const filtered = segments.filter(
    (s) =>
      s.box.h <= opts.maxLineHeight &&
      s.box.w / Math.max(s.box.h, 1e-6) >= opts.minAspectRatio,
  );
  if (filtered.length === 0) return null;

  // Thống nhất bề rộng theo dải (canh giữa, ≈ dòng dài nhất, kẹp ≤ maxBandWidth).
  const lines = opts.unifyBandWidth
    ? toUnifiedBands(filtered, opts.maxLineHeight, opts.maxBandWidth, opts.bandSidePad)
    : filtered;

  const stages: string[] = [];
  const perSegment: SegmentPlan[] = [];
  let cur = '[0:v]';

  // Dải đã thống nhất đã bao gồm pad nhỏ trong width → không nới ngang thêm.
  const effPadX = opts.unifyBandWidth ? 0 : opts.padXPct;

  lines.forEach((seg, i) => {
    const mode = pickSegmentMode(seg.box.h, opts.mode, opts.delogoMaxHeight);
    const { px, py, pw, ph } = padToPixels(seg.box, effPadX, opts.padYPct, videoWidth, videoHeight);
    const out = `[vc${i}]`;
    const en = between(seg.startSec, seg.endSec);

    if (mode === 'delogo') {
      stages.push(`${cur}delogo=x=${px}:y=${py}:w=${pw}:h=${ph}:show=0:${en}${out}`);
    } else if (mode === 'solid') {
      stages.push(`${cur}drawbox=x=${px}:y=${py}:w=${pw}:h=${ph}:color=black@1:t=fill:${en}${out}`);
    } else {
      // blur: split → crop vùng → boxblur → overlay lại đúng chỗ, timed.
      stages.push(
        `${cur}split[bs${i}][bc${i}];` +
          `[bc${i}]crop=w=${pw}:h=${ph}:x=${px}:y=${py},boxblur=${opts.blurStrength}[bb${i}];` +
          `[bs${i}][bb${i}]overlay=x=${px}:y=${py}:${en}${out}`,
      );
    }

    perSegment.push({
      index: i,
      mode,
      startSec: seg.startSec,
      endSec: seg.endSec,
      rect: { px, py, pw, ph },
    });
    cur = out;
  });

  return { chain: stages.join(';'), lastLabel: cur, perSegment };
}
