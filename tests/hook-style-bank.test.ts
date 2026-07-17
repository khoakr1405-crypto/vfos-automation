import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  HOOK_STYLES,
  type HookHistoryEntry,
  isHookRepeat,
  pickHookStyle,
} from '../scripts/ent-vlog/lib/hook-style-bank.ts';

function countWords(s: string): number {
  return s.trim().split(/\s+/).length;
}

describe('hook-style-bank: cấu trúc bank', () => {
  test('9 nhóm giọng, id không trùng', () => {
    assert.equal(HOOK_STYLES.length, 9);
    const ids = HOOK_STYLES.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('3 giọng bổ sung có mặt: canh_bao / nguoc_chieu / bi_mat', () => {
    const ids = new Set(HOOK_STYLES.map((s) => s.id));
    for (const id of ['canh_bao', 'nguoc_chieu', 'bi_mat']) {
      assert.ok(ids.has(id), `thiếu giọng ${id}`);
    }
  });

  test('mọi ví dụ minh hoạ đúng khổ hook 8–13 từ', () => {
    for (const style of HOOK_STYLES) {
      assert.ok(style.examples.length >= 2, `${style.id} cần ≥2 ví dụ`);
      for (const ex of style.examples) {
        const n = countWords(ex);
        assert.ok(n >= 8 && n <= 13, `${style.id} ví dụ "${ex}" = ${n} từ (cần 8–13)`);
      }
    }
  });

  test('không ví dụ nào dính mô-típ cấm của chính gate chống lặp', () => {
    for (const style of HOOK_STYLES) {
      for (const ex of style.examples) {
        const { repeat, reason } = isHookRepeat(ex, [], 'job_x');
        assert.equal(repeat, false, `${style.id} ví dụ "${ex}" bị gate chặn: ${reason}`);
      }
    }
  });
});

describe('hook-style-bank: xoay vòng với pool 9 giọng', () => {
  const historyOf = (styleIds: string[]): HookHistoryEntry[] =>
    styleIds.map((styleId, i) => ({
      jobId: `job_${i}`,
      styleId,
      hookText: `hook ${i}`,
      at: '2026-07-18T00:00:00Z',
    }));

  test('né style của 3 job khác gần nhất', () => {
    const hist = historyOf(['bat_ngo', 'canh_bao', 'bi_mat']);
    for (let i = 0; i < 20; i += 1) {
      const chosen = pickHookStyle(`ent_job_${i}`, hist);
      assert.ok(!['bat_ngo', 'canh_bao', 'bi_mat'].includes(chosen.id));
    }
  });

  test('deterministic: cùng jobId ra cùng style', () => {
    const hist = historyOf(['nguoc_chieu']);
    const a = pickHookStyle('ent_fishing_777', hist);
    const b = pickHookStyle('ent_fishing_777', hist);
    assert.equal(a.id, b.id);
  });
});

describe('hook-style-bank: chống lặp nội dung', () => {
  const hist: HookHistoryEntry[] = [
    {
      jobId: 'job_old',
      styleId: 'bat_ngo',
      hookText: 'Thề luôn, mới thả xuống mà nó đã dính ngay.',
      at: '2026-07-18T00:00:00Z',
    },
  ];

  test('trùng nguyên văn hook job khác → repeat', () => {
    const r = isHookRepeat('Thề luôn, mới thả xuống mà nó đã dính ngay.', hist, 'job_new');
    assert.equal(r.repeat, true);
  });

  test('trùng 4 từ mở đầu → repeat', () => {
    const r = isHookRepeat('Thề luôn mới thả cái là dính liền tay.', hist, 'job_new');
    assert.equal(r.repeat, true);
  });

  test('cùng jobId re-run → không tính lặp', () => {
    const r = isHookRepeat('Thề luôn, mới thả xuống mà nó đã dính ngay.', hist, 'job_old');
    assert.equal(r.repeat, false);
  });
});
