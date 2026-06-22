/* =============================================================================
 * VFOS — Source-subtitle detection CORE (pure, testable)
 * -----------------------------------------------------------------------------
 * Hàm thuần cho detector phụ đề Trung burned-in: lọc CJK, gộp word-box thành
 * dòng, cluster các frame liên tiếp thành "đoạn phụ đề", chuẩn hoá toạ độ 0–1.
 * KHÔNG IO (không ffmpeg/tesseract) — phần đó ở source-subtitle-detector.ts.
 * ========================================================================== */

export interface PixelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NormBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WordDetection {
  text: string;
  box: PixelBox;
  confidence: number;
}

export interface FrameDetection {
  timeSec: number;
  lines: PixelBox[];
}

export interface SubtitleSegment {
  startSec: number;
  endSec: number;
  box: NormBox;
  frames: number;
  sampleText?: string;
}

// CJK Hán: Ext-A + Unified + Compatibility (khớp range dùng ở cn-search/UI).
const CJK_RE = /[㐀-䶿一-鿿豈-﫿]/;

/** True nếu chuỗi chứa ít nhất 1 ký tự Hán (CJK). */
export function isCjk(text: string): boolean {
  return CJK_RE.test(text ?? '');
}

/** Tỉ lệ ký tự Hán trên tổng ký tự không-trắng (0..1). */
export function cjkRatio(text: string): number {
  const t = (text ?? '').replace(/\s/g, '');
  if (t.length === 0) return 0;
  let n = 0;
  for (const ch of t) if (CJK_RE.test(ch)) n++;
  return n / t.length;
}

/** Hai box có chồng theo trục dọc đủ nhiều (cùng một dòng chữ) không? */
function sameLine(a: PixelBox, b: PixelBox): boolean {
  const aMid = a.y + a.h / 2;
  const bMid = b.y + b.h / 2;
  const tol = Math.max(a.h, b.h) * 0.6;
  return Math.abs(aMid - bMid) <= tol;
}

function unionPixel(a: PixelBox, b: PixelBox): PixelBox {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w);
  const y2 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/**
 * Gộp các word-box (đã lọc CJK) cùng một dòng ngang thành 1 line-box. Phụ đề
 * thường 1 dòng → cho ra 1 (đôi khi 2) line-box / frame.
 */
export function mergeBoxesToLines(boxes: PixelBox[]): PixelBox[] {
  const sorted = [...boxes].sort((p, q) => p.y - q.y || p.x - q.x);
  const lines: PixelBox[] = [];
  for (const b of sorted) {
    const hit = lines.find((l) => sameLine(l, b));
    if (hit) {
      const merged = unionPixel(hit, b);
      hit.x = merged.x;
      hit.y = merged.y;
      hit.w = merged.w;
      hit.h = merged.h;
    } else {
      lines.push({ ...b });
    }
  }
  return lines;
}

/** IoU (intersection-over-union) của 2 pixel-box — đo độ trùng vị trí. */
export function iou(a: PixelBox, b: PixelBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const iw = Math.max(0, x2 - x1);
  const ih = Math.max(0, y2 - y1);
  const inter = iw * ih;
  if (inter <= 0) return 0;
  const uni = a.w * a.h + b.w * b.h - inter;
  return uni > 0 ? inter / uni : 0;
}

export interface ClusterOptions {
  /** IoU tối thiểu để coi 2 frame liên tiếp là cùng 1 đoạn phụ đề. */
  minIou: number;
  /** Khoảng cách thời gian tối đa (giây) để nối 2 frame (chịu được 1 frame trống). */
  maxGapSec: number;
  /** Số frame tối thiểu để giữ 1 đoạn (loại nhiễu xuất hiện 1 frame). */
  minFrames: number;
}

export const DEFAULT_CLUSTER: ClusterOptions = {
  minIou: 0.3,
  maxGapSec: 0.9,
  minFrames: 2,
};

interface RunningSeg {
  startSec: number;
  endSec: number;
  box: PixelBox;
  frames: number;
}

/**
 * Cluster các frame-detection liên tiếp (mỗi frame có ≥1 line-box) thành các
 * đoạn phụ đề ổn định theo thời gian. Box của đoạn = union của các line-box
 * trùng vị trí. Trả về box ở PIXEL (chuẩn hoá ở normalizeSegments).
 */
export function clusterFramesToSegments(
  frames: FrameDetection[],
  videoWidth: number,
  videoHeight: number,
  opts: ClusterOptions = DEFAULT_CLUSTER,
): SubtitleSegment[] {
  const ordered = [...frames].sort((a, b) => a.timeSec - b.timeSec);
  const open: RunningSeg[] = [];
  const closed: RunningSeg[] = [];

  const flushStale = (now: number) => {
    for (let i = open.length - 1; i >= 0; i--) {
      const seg = open[i]!;
      if (now - seg.endSec > opts.maxGapSec) {
        closed.push(seg);
        open.splice(i, 1);
      }
    }
  };

  for (const fr of ordered) {
    flushStale(fr.timeSec);
    for (const line of fr.lines) {
      const match = open.find((s) => iou(s.box, line) >= opts.minIou);
      if (match) {
        match.box = unionPixel(match.box, line);
        match.endSec = fr.timeSec;
        match.frames += 1;
      } else {
        open.push({ startSec: fr.timeSec, endSec: fr.timeSec, box: { ...line }, frames: 1 });
      }
    }
  }
  closed.push(...open);

  return closed
    .filter((s) => s.frames >= opts.minFrames)
    .sort((a, b) => a.startSec - b.startSec)
    .map((s) => ({
      startSec: Number(s.startSec.toFixed(3)),
      endSec: Number(s.endSec.toFixed(3)),
      box: normalizeBox(s.box, videoWidth, videoHeight),
      frames: s.frames,
    }));
}

export interface BandOptions {
  /** Gộp 2 đoạn vào CÙNG băng nếu tâm-y chênh ≤ ngưỡng (tỉ lệ H). */
  yTolerance: number;
  /** Bắc cầu (nối liên tục) 2 đoạn cùng băng nếu khoảng trống thời gian ≤ ngưỡng
   * giây — lấp các gap do OCR trượt frame. Gap lớn hơn → tách band riêng. */
  maxBridgeSec: number;
  /** Bỏ băng có tổng frame < ngưỡng (nhiễu/outlier xuất hiện thoáng qua). */
  minBandFrames: number;
}

export const DEFAULT_BAND: BandOptions = {
  yTolerance: 0.06,
  maxBridgeSec: 6,
  minBandFrames: 3,
};

/** Đoạn cầu lấp gap [a.end, b.start]: box = union 2 đoạn kề (chỉ rộng cục bộ chỗ
 * gap, KHÔNG rộng toàn timeline). Đủ phủ cả 2 dòng quanh gap. */
function bridgeSeg(a: SubtitleSegment, b: SubtitleSegment): SubtitleSegment {
  const r4 = (n: number) => Number(n.toFixed(4));
  const x1 = Math.min(a.box.x, b.box.x);
  const y1 = Math.min(a.box.y, b.box.y);
  const x2 = Math.max(a.box.x + a.box.w, b.box.x + b.box.w);
  const y2 = Math.max(a.box.y + a.box.h, b.box.y + b.box.h);
  return {
    startSec: a.endSec,
    endSec: b.startSec,
    box: { x: r4(x1), y: r4(y1), w: r4(x2 - x1), h: r4(y2 - y1) },
    frames: 0,
  };
}

/**
 * Làm phụ đề LIÊN TỤC theo thời gian nhưng ĐỘ RỘNG BÁM THEO FORM CHỮ: giữ box
 * RIÊNG từng đoạn (rộng đúng theo chữ đoạn đó), chỉ lấp gap OCR-miss bằng đoạn
 * cầu = union 2 đoạn kề (rộng cục bộ tại gap). KHÔNG dùng 1 dải rộng cố định
 * (union toàn bộ). Băng quá ít frame (nhiễu/outlier như logo thoáng qua) bị loại.
 */
export function consolidateBands(
  segments: readonly SubtitleSegment[],
  opts: BandOptions = DEFAULT_BAND,
): SubtitleSegment[] {
  // 1) Gom theo băng y.
  const bands: SubtitleSegment[][] = [];
  for (const s of [...segments].sort((a, b) => a.box.y + a.box.h / 2 - (b.box.y + b.box.h / 2))) {
    const sMid = s.box.y + s.box.h / 2;
    let band = bands.find((b) =>
      b.some((m) => Math.abs(m.box.y + m.box.h / 2 - sMid) <= opts.yTolerance),
    );
    if (!band) {
      band = [];
      bands.push(band);
    }
    band.push(s);
  }

  // 2) Trong mỗi băng: tách "run" (gap ≤ maxBridgeSec). Mỗi run → các đoạn GỐC
  //    (box riêng theo chữ) + đoạn cầu cho gap. Bỏ run quá ít frame.
  const out: SubtitleSegment[] = [];
  for (const band of bands) {
    const sorted = [...band].sort((a, b) => a.startSec - b.startSec);
    let run: SubtitleSegment[] = [];
    const flush = () => {
      if (run.length === 0) return;
      const frames = run.reduce((n, s) => n + s.frames, 0);
      if (frames >= opts.minBandFrames) {
        for (let i = 0; i < run.length; i++) {
          const cur = run[i]!;
          out.push(cur);
          const next = run[i + 1];
          if (next && next.startSec > cur.endSec) out.push(bridgeSeg(cur, next));
        }
      }
      run = [];
    };
    for (const s of sorted) {
      const prev = run[run.length - 1];
      if (prev && s.startSec - prev.endSec > opts.maxBridgeSec) flush();
      run.push(s);
    }
    flush();
  }
  return out.sort((a, b) => a.startSec - b.startSec);
}

export interface StabilizeOptions {
  /** Nới DỌC mỗi phía (tỉ lệ H) — dải cao hơn chữ một chút, chống lòi mép. */
  padY: number;
  /** Nới NGANG mỗi phía (tỉ lệ W) — phủ rộng hơn form chữ, chống nhấp nháy 2 bên. */
  sidePad: number;
  /** TRẦN chiều cao dải (tỉ lệ H) — không che quá nhiều khung hình. */
  maxBandH: number;
  /** Gộp đoạn vào CÙNG dải nếu tâm-y chênh ≤ ngưỡng (tỉ lệ H). */
  yTolerance: number;
}

export const DEFAULT_STABILIZE: StabilizeOptions = {
  padY: 0.022,
  sidePad: 0.06,
  maxBandH: 0.14,
  yTolerance: 0.06,
};

/**
 * STABLE BAND (opt-in cho lane reup): biến các đoạn phụ đề rời rạc thành 1 DẢI
 * LIÊN TỤC mỗi băng-y, phủ TỪ GIÂY 0 đến hết video (persistent) → KHÔNG nhấp nháy
 * và KHÔNG bắt đầu trễ. Box = union các dòng trong băng + dilate (padY/sidePad),
 * kẹp trần chiều cao. Ưu tiên CHE ỔN ĐỊNH cả dải thay vì box khít theo form chữ.
 * Chỉ dùng cho video reup có hardsub gần liên tục; KHÔNG đổi hành vi detector mặc
 * định (Product Review không bật flag này).
 */
export function stabilizeBands(
  segments: readonly SubtitleSegment[],
  videoDurationSec: number,
  opts: StabilizeOptions = DEFAULT_STABILIZE,
): SubtitleSegment[] {
  if (segments.length === 0 || videoDurationSec <= 0) return [];
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const r4 = (n: number) => Number(n.toFixed(4));

  // 1) Gom theo băng y (tâm box).
  const bands: SubtitleSegment[][] = [];
  for (const s of [...segments].sort((a, b) => a.box.y + a.box.h / 2 - (b.box.y + b.box.h / 2))) {
    const mid = s.box.y + s.box.h / 2;
    let band = bands.find((b) =>
      b.some((m) => Math.abs(m.box.y + m.box.h / 2 - mid) <= opts.yTolerance),
    );
    if (!band) {
      band = [];
      bands.push(band);
    }
    band.push(s);
  }

  // 2) Mỗi băng → 1 dải liên tục [0, duration] với box union đã dilate.
  const out: SubtitleSegment[] = [];
  for (const band of bands) {
    const reals = band.filter((s) => s.frames > 0);
    const basis = reals.length > 0 ? reals : band;
    const top = Math.min(...basis.map((s) => s.box.y));
    const bot = Math.max(...basis.map((s) => s.box.y + s.box.h));
    let y = clamp01(top - opts.padY);
    let h = clamp01(bot - top + opts.padY * 2);
    if (h > opts.maxBandH) {
      const cy = y + h / 2;
      h = opts.maxBandH;
      y = clamp01(cy - h / 2);
    }
    const left = Math.min(...basis.map((s) => s.box.x));
    const right = Math.max(...basis.map((s) => s.box.x + s.box.w));
    const x = clamp01(left - opts.sidePad);
    const w = clamp01(Math.min(right + opts.sidePad, 1) - x);
    out.push({
      startSec: 0,
      endSec: r4(videoDurationSec),
      box: { x: r4(x), y: r4(y), w: r4(w), h: r4(h) },
      frames: band.reduce((n, s) => n + s.frames, 0),
    });
  }
  return out.sort((a, b) => a.box.y - b.box.y);
}

/** Chuẩn hoá pixel-box → 0..1 (clamp trong khung). */
export function normalizeBox(box: PixelBox, w: number, h: number): NormBox {
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const nx = clamp01(box.x / w);
  const ny = clamp01(box.y / h);
  return {
    x: Number(nx.toFixed(4)),
    y: Number(ny.toFixed(4)),
    w: Number(clamp01(box.w / w).toFixed(4)),
    h: Number(clamp01(box.h / h).toFixed(4)),
  };
}
