import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  DEFAULT_TEXT_DENSITY,
  type FrameCjkObservation,
  assessTextDensity,
} from '../scripts/subtitle-mask/text-density.ts';

function frames(midYsPerFrame: number[][]): FrameCjkObservation[] {
  return midYsPerFrame.map((midYs, i) => ({
    frameFile: `frame_${i + 1}.jpg`,
    cjkLineMidYs: midYs,
  }));
}

describe('text-density: verdict thuần', () => {
  test('Test Vàng POV job_20260715_002 — chữ giữa khung 5/5 frame → TEXT_HEAVY', () => {
    // Vị trí thật đo được từ video lỗi: midY ≈ 0.18–0.42 (trên vùng che 0.70).
    const res = assessTextDensity(
      frames([[0.4], [0.18], [0.25], [0.27], [0.3]]),
      5,
      DEFAULT_TEXT_DENSITY,
    );
    assert.equal(res.status, 'TEXT_HEAVY');
    assert.equal(res.framesWithUnscrubbableCjk, 5);
    assert.equal(res.unscrubbableFrameRatio, 1);
  });

  test('Test Vàng lane câu cá — phụ đề dải đáy 5/5 frame → OK (scrub cứu được)', () => {
    // Hardsub đáy màn hình midY ≈ 0.74–0.86: stable-band delogo xử lý bình thường.
    const res = assessTextDensity(
      frames([[0.78], [0.8], [0.76], [0.82], [0.85]]),
      5,
      DEFAULT_TEXT_DENSITY,
    );
    assert.equal(res.status, 'OK');
    assert.equal(res.framesWithUnscrubbableCjk, 0);
    assert.equal(res.framesWithScrubbableOnlyCjk, 5);
  });

  test('biên ngưỡng: đúng 2/5 frame (ratio 0.4) → TEXT_HEAVY; 1/5 → OK', () => {
    const heavy = assessTextDensity(
      frames([[0.3], [0.35], [0.8], [], []]),
      5,
      DEFAULT_TEXT_DENSITY,
    );
    assert.equal(heavy.status, 'TEXT_HEAVY');
    assert.equal(heavy.unscrubbableFrameRatio, 0.4);

    const ok = assessTextDensity(frames([[0.3], [0.8], [], [], []]), 5, DEFAULT_TEXT_DENSITY);
    assert.equal(ok.status, 'OK');
    assert.equal(ok.unscrubbableFrameRatio, 0.2);
  });

  test('midY đúng bằng scrubbableYMin (0.70) tính là CHE ĐƯỢC — không chặn nhầm', () => {
    const res = assessTextDensity(
      frames([[0.7], [0.7], [0.7], [0.7], [0.7]]),
      5,
      DEFAULT_TEXT_DENSITY,
    );
    assert.equal(res.status, 'OK');
    assert.equal(res.framesWithScrubbableOnlyCjk, 5);
  });

  test('frame có CẢ chữ giữa lẫn chữ đáy → tính là unscrubbable (một dòng dính là dính)', () => {
    const res = assessTextDensity(
      frames([
        [0.3, 0.8],
        [0.25, 0.78],
        [0.4, 0.82],
        [0.2, 0.8],
        [0.35, 0.85],
      ]),
      5,
      DEFAULT_TEXT_DENSITY,
    );
    assert.equal(res.status, 'TEXT_HEAVY');
    assert.equal(res.framesWithUnscrubbableCjk, 5);
    assert.equal(res.framesWithScrubbableOnlyCjk, 0);
  });

  test('không frame nào → SKIPPED_NO_FRAMES (không chặn, không chia 0)', () => {
    const res = assessTextDensity([], 0, DEFAULT_TEXT_DENSITY);
    assert.equal(res.status, 'SKIPPED_NO_FRAMES');
    assert.equal(res.unscrubbableFrameRatio, 0);
  });

  test('frame sạch hoàn toàn (0 CJK) → OK ratio 0', () => {
    const res = assessTextDensity(frames([[], [], [], [], []]), 5, DEFAULT_TEXT_DENSITY);
    assert.equal(res.status, 'OK');
    assert.equal(res.framesWithUnscrubbableCjk, 0);
    assert.equal(res.framesWithScrubbableOnlyCjk, 0);
  });
});
