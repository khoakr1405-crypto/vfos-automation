import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  cjkRatio,
  clusterFramesToSegments,
  consolidateBands,
  isCjk,
  iou,
  mergeBoxesToLines,
  normalizeBox,
  type SubtitleSegment,
} from '../scripts/subtitle-mask/detect-core.ts';
import { buildCoverChain, pickSegmentMode } from '../scripts/subtitle-mask/cover-filter.ts';

describe('detect-core: CJK', () => {
  test('isCjk / cjkRatio', () => {
    assert.equal(isCjk('它是这种'), true);
    assert.equal(isCjk('Múi thứ tư'), false);
    assert.equal(cjkRatio('它是这种ab') > 0.5, true);
    assert.equal(cjkRatio('abc它') < 0.5, true);
  });
});

describe('detect-core: gộp dòng + IoU', () => {
  test('2 word-box cùng dòng → 1 line; khác dòng → 2', () => {
    const sameLine = mergeBoxesToLines([
      { x: 100, y: 900, w: 60, h: 50 },
      { x: 170, y: 905, w: 60, h: 50 },
    ]);
    assert.equal(sameLine.length, 1);
    assert.equal(sameLine[0]!.w >= 130, true);

    const twoLines = mergeBoxesToLines([
      { x: 100, y: 200, w: 60, h: 50 },
      { x: 100, y: 900, w: 60, h: 50 },
    ]);
    assert.equal(twoLines.length, 2);
  });
  test('iou trùng hoàn toàn = 1, rời nhau = 0', () => {
    const b = { x: 0, y: 0, w: 10, h: 10 };
    assert.equal(iou(b, b), 1);
    assert.equal(iou(b, { x: 100, y: 100, w: 10, h: 10 }), 0);
  });
});

describe('detect-core: cluster theo thời gian', () => {
  test('box ổn định qua 3 frame → 1 đoạn; nhiễu 1 frame → bỏ', () => {
    const box = { x: 100, y: 900, w: 500, h: 60 };
    const frames = [
      { timeSec: 0.0, lines: [box] },
      { timeSec: 0.5, lines: [{ ...box, x: 102 }] },
      { timeSec: 1.0, lines: [{ ...box, x: 98 }] },
      { timeSec: 5.0, lines: [{ x: 50, y: 300, w: 80, h: 40 }] }, // nhiễu 1 frame
    ];
    const segs = clusterFramesToSegments(frames, 720, 1280);
    assert.equal(segs.length, 1);
    assert.equal(segs[0]!.frames, 3);
    assert.equal(segs[0]!.box.y > 0.69 && segs[0]!.box.y < 0.71, true);
  });
});

describe('detect-core: normalize', () => {
  test('chuẩn hoá + clamp 0..1', () => {
    assert.deepEqual(normalizeBox({ x: 360, y: 640, w: 360, h: 128 }, 720, 1280), {
      x: 0.5,
      y: 0.5,
      w: 0.5,
      h: 0.1,
    });
  });
});

describe('cover-filter: chọn mode (theo box height)', () => {
  test('auto: box mỏng → delogo; box cao → blur; mode ép giữ nguyên', () => {
    assert.equal(pickSegmentMode(0.05, 'auto', 0.1), 'delogo');
    assert.equal(pickSegmentMode(0.2, 'auto', 0.1), 'blur');
    assert.equal(pickSegmentMode(0.2, 'delogo', 0.1), 'delogo');
    assert.equal(pickSegmentMode(0.05, 'blur', 0.1), 'blur');
  });
});

const seg = (over: Partial<SubtitleSegment> & { bgComplexity?: number }): SubtitleSegment =>
  ({
    startSec: 1,
    endSec: 4,
    box: { x: 0.1, y: 0.7, w: 0.8, h: 0.06 },
    frames: 4,
    ...over,
  }) as SubtitleSegment;

describe('detect-core: consolidateBands (liên tục + width bám form chữ)', () => {
  const BAND = { yTolerance: 0.06, maxBridgeSec: 6, minBandFrames: 3 };
  test('cùng băng + gap nhỏ → đoạn gốc + cầu, LIÊN TỤC, box riêng theo chữ', () => {
    const bands = consolidateBands(
      [
        seg({ startSec: 0, endSec: 2, box: { x: 0.2, y: 0.72, w: 0.5, h: 0.04 }, frames: 4 }),
        seg({ startSec: 6, endSec: 9, box: { x: 0.15, y: 0.73, w: 0.6, h: 0.03 }, frames: 6 }),
      ],
      BAND,
    );
    // seg0 + bridge + seg1
    assert.equal(bands.length, 3);
    // liên tục: end[i] == start[i+1]; phủ [0,9]
    assert.equal(bands[0]!.endSec, bands[1]!.startSec);
    assert.equal(bands[1]!.endSec, bands[2]!.startSec);
    assert.equal(bands[0]!.startSec, 0);
    assert.equal(bands[2]!.endSec, 9);
    // box GỐC giữ width riêng (đoạn đầu w≈0.5, KHÔNG bị nong tới 0.65)
    assert.equal(Math.abs(bands[0]!.box.w - 0.5) < 0.001, true);
    // cầu (giữa) = union 2 đoạn kề (chỉ rộng tại gap)
    assert.equal(bands[1]!.box.x <= 0.15, true);
    assert.equal(bands[1]!.box.x + bands[1]!.box.w >= 0.7, true);
  });
  test('outlier khác băng + ít frame → bị loại', () => {
    const bands = consolidateBands(
      [
        seg({ startSec: 0, endSec: 4, box: { x: 0.2, y: 0.72, w: 0.5, h: 0.04 }, frames: 8 }),
        seg({ startSec: 5, endSec: 5.5, box: { x: 0.85, y: 0.46, w: 0.14, h: 0.13 }, frames: 2 }),
      ],
      BAND,
    );
    assert.equal(bands.length, 1);
    assert.equal(bands[0]!.box.y > 0.7, true);
  });
  test('gap lớn hơn maxBridge → KHÔNG bắc cầu (2 đoạn rời)', () => {
    const bands = consolidateBands(
      [
        seg({ startSec: 0, endSec: 2, box: { x: 0.2, y: 0.72, w: 0.5, h: 0.04 }, frames: 4 }),
        seg({ startSec: 12, endSec: 15, box: { x: 0.2, y: 0.72, w: 0.5, h: 0.04 }, frames: 6 }),
      ],
      BAND,
    );
    assert.equal(bands.length, 2);
  });
});

const OPT = {
  maxLineHeight: 0.16,
  minAspectRatio: 2.5,
  unifyBandWidth: false,
  maxBandWidth: 0.88,
  bandSidePad: 0.02,
  padXPct: 0.07,
  padYPct: 0.006,
  delogoMaxHeight: 0.1,
  blurStrength: 18,
};

describe('cover-filter: buildCoverChain', () => {
  test('off / rỗng / dims xấu → null', () => {
    assert.equal(buildCoverChain([seg({})], 720, 1280, { mode: 'off', ...OPT }), null);
    assert.equal(buildCoverChain([], 720, 1280, { mode: 'delogo', ...OPT }), null);
    assert.equal(buildCoverChain([seg({})], 0, 0, { mode: 'delogo', ...OPT }), null);
  });

  test('box CAO (logo/khối) → bị lọc bỏ, không xóa mảng to', () => {
    // box h=0.2 > maxLineHeight 0.16 → drop. Chỉ có box này → null.
    assert.equal(
      buildCoverChain([seg({ box: { x: 0.1, y: 0.4, w: 0.8, h: 0.2 } })], 720, 1280, {
        mode: 'delogo',
        ...OPT,
      }),
      null,
    );
    // 1 dòng mỏng + 1 box cao → chỉ giữ dòng mỏng (1 stage).
    const c = buildCoverChain(
      [seg({}), seg({ box: { x: 0.1, y: 0.4, w: 0.8, h: 0.2 } })],
      720,
      1280,
      { mode: 'delogo', ...OPT },
    );
    assert.ok(c);
    assert.equal(c!.perSegment.length, 1);
  });

  test('lọc theo FORM (aspect): dòng cao-nhưng-RỘNG → giữ; logo vuông → loại', () => {
    // Dòng phụ đề h=0.11 (cao hơn ngưỡng cũ 0.08) nhưng rộng (ratio 6.4) → GIỮ.
    const wideTall = buildCoverChain(
      [seg({ box: { x: 0.1, y: 0.72, w: 0.7, h: 0.11 } })],
      720,
      1280,
      { mode: 'delogo', ...OPT },
    );
    assert.ok(wideTall);
    assert.equal(wideTall!.perSegment.length, 1);
    // Logo VUÔNG h=0.13 w=0.14 (ratio 1.08 < 2.5) → LOẠI dù dưới trần chiều cao.
    assert.equal(
      buildCoverChain([seg({ box: { x: 0.85, y: 0.46, w: 0.14, h: 0.13 } })], 720, 1280, {
        mode: 'delogo',
        ...OPT,
      }),
      null,
    );
  });

  test('unified band: box hẹp/rộng cùng dải → CHUNG width chuẩn, canh giữa, KHÔNG full-frame', () => {
    const wide = seg({ startSec: 1, endSec: 3, box: { x: 0.1, y: 0.74, w: 0.7, h: 0.06 } });
    const narrowCenter = seg({ startSec: 5, endSec: 6, box: { x: 0.33, y: 0.74, w: 0.34, h: 0.05 } });
    const c = buildCoverChain([wide, narrowCenter], 720, 1280, {
      mode: 'delogo',
      ...OPT,
      unifyBandWidth: true,
    });
    assert.ok(c);
    assert.equal(c!.perSegment.length, 2);
    const r0 = c!.perSegment[0]!.rect;
    const r1 = c!.perSegment[1]!.rect;
    // Cùng dải → box chuẩn y hệt nhau (width/x/y/h), không nhảy theo từng đoạn.
    assert.equal(r0.px === r1.px && r0.pw === r1.pw, true);
    assert.equal(r0.py === r1.py && r0.ph === r1.ph, true);
    // KHÔNG full-frame: không bám mép (px > 1) và không phủ kín (pw < W).
    assert.equal(r0.px > 1, true);
    assert.equal(r0.pw < 720, true);
    // Width chuẩn phủ HẾT dòng rộng nhất (extent [0.1,0.8] → ≥ 0.7*W); đoạn hẹp
    // (tự nó chỉ 0.34*W) vẫn dùng width chuẩn này → không lòi 2 bên.
    assert.equal(r0.pw >= Math.round(0.7 * 720), true);
    // Clamp an toàn ≤ maxBandWidth (0.88*W).
    assert.equal(r0.pw <= Math.round(0.88 * 720), true);
  });

  test('delogo: dòng mỏng → pixel nguyên (padX rộng) + enable + lastLabel', () => {
    const c = buildCoverChain([seg({})], 720, 1280, { mode: 'delogo', ...OPT });
    assert.ok(c);
    assert.match(c!.chain, /delogo=x=\d+:y=\d+:w=\d+:h=\d+/);
    assert.doesNotMatch(c!.chain, /iw\*/); // KHÔNG còn biểu thức (delogo không nhận)
    assert.match(c!.chain, /enable='between\(t,1,4\)'/);
    assert.equal(c!.lastLabel, '[vc0]');
    assert.equal(c!.perSegment[0]!.mode, 'delogo');
    // padX rộng hơn padY: box w=0.8 + 0.14 → pw lớn; h=0.06 + 0.012 → ph nhỏ.
    assert.equal(c!.perSegment[0]!.rect.pw > c!.perSegment[0]!.rect.ph, true);
  });

  test('blur (ép) trên dòng mỏng → split + boxblur + overlay pixel', () => {
    const c = buildCoverChain([seg({})], 720, 1280, { mode: 'blur', ...OPT });
    assert.ok(c);
    assert.match(c!.chain, /split/);
    assert.match(c!.chain, /boxblur=18/);
    assert.match(c!.chain, /overlay=x=\d+:y=\d+/);
    assert.equal(c!.perSegment[0]!.mode, 'blur');
  });

  test('solid: drawbox fill pixel', () => {
    const c = buildCoverChain([seg({})], 720, 1280, { mode: 'solid', ...OPT });
    assert.ok(c);
    assert.match(c!.chain, /drawbox=x=\d+:y=\d+:w=\d+:h=\d+:color=black@1:t=fill/);
  });
});
