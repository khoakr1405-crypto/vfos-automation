import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  type AutoApproveCheck,
  MIN_OVERALL_SCORE,
  parseAutoApproveConfig,
  rollupVerdict,
  statusFromBandedScore,
  statusFromSoftScore,
  tokenOverlapSimilarity,
} from '../scripts/job-manager/core/auto-approve-core.ts';

function check(status: AutoApproveCheck['status'], key = 'k'): AutoApproveCheck {
  return { key, status, reasons: [] };
}

describe('rollupVerdict: fail-closed', () => {
  test('empty checks → NEEDS_HUMAN (never PASS by exception)', () => {
    assert.equal(rollupVerdict([], 10), 'NEEDS_HUMAN');
  });

  test('any FAIL → FAIL even with perfect overall + other passes', () => {
    assert.equal(rollupVerdict([check('PASS'), check('FAIL'), check('PASS')], 10), 'FAIL');
  });

  test('FAIL takes precedence over NEEDS_HUMAN', () => {
    assert.equal(rollupVerdict([check('NEEDS_HUMAN'), check('FAIL')], 10), 'FAIL');
  });

  test('any NEEDS_HUMAN (no FAIL) → NEEDS_HUMAN', () => {
    assert.equal(rollupVerdict([check('PASS'), check('NEEDS_HUMAN')], 10), 'NEEDS_HUMAN');
  });

  test('all PASS but overall below floor → NEEDS_HUMAN', () => {
    assert.equal(
      rollupVerdict([check('PASS'), check('PASS')], MIN_OVERALL_SCORE - 0.1),
      'NEEDS_HUMAN',
    );
  });

  test('all PASS + overall at floor → PASS', () => {
    assert.equal(rollupVerdict([check('PASS'), check('PASS')], MIN_OVERALL_SCORE), 'PASS');
  });

  test('non-finite overall → NEEDS_HUMAN', () => {
    assert.equal(rollupVerdict([check('PASS')], Number.NaN), 'NEEDS_HUMAN');
  });
});

describe('statusFromSoftScore: soft never auto-FAILs', () => {
  test('at/above threshold → PASS', () => {
    assert.equal(statusFromSoftScore(6, 6), 'PASS');
    assert.equal(statusFromSoftScore(9, 6), 'PASS');
  });
  test('below threshold → NEEDS_HUMAN (not FAIL)', () => {
    assert.equal(statusFromSoftScore(5.9, 6), 'NEEDS_HUMAN');
    assert.equal(statusFromSoftScore(0, 6), 'NEEDS_HUMAN');
  });
  test('NaN → NEEDS_HUMAN', () => {
    assert.equal(statusFromSoftScore(Number.NaN, 6), 'NEEDS_HUMAN');
  });
});

describe('statusFromBandedScore: product-match style bands', () => {
  test('>= pass → PASS', () => {
    assert.equal(statusFromBandedScore(0.75, 0.75, 0.5), 'PASS');
    assert.equal(statusFromBandedScore(1, 0.75, 0.5), 'PASS');
  });
  test('< fail → FAIL (hard bait-and-switch guard)', () => {
    assert.equal(statusFromBandedScore(0.49, 0.75, 0.5), 'FAIL');
    assert.equal(statusFromBandedScore(0, 0.75, 0.5), 'FAIL');
  });
  test('ambiguous band → NEEDS_HUMAN', () => {
    assert.equal(statusFromBandedScore(0.6, 0.75, 0.5), 'NEEDS_HUMAN');
  });
  test('NaN → NEEDS_HUMAN', () => {
    assert.equal(statusFromBandedScore(Number.NaN, 0.75, 0.5), 'NEEDS_HUMAN');
  });
});

describe('parseAutoApproveConfig: default OFF, per-lane override wins', () => {
  test('nothing set → both off (byte-identical manual behavior)', () => {
    assert.deepEqual(parseAutoApproveConfig({}), { review: false, ent: false });
  });
  test('global on → both on', () => {
    assert.deepEqual(parseAutoApproveConfig({ VFOS_AUTO_APPROVE: 'on' }), {
      review: true,
      ent: true,
    });
  });
  test('per-lane override beats global', () => {
    assert.deepEqual(
      parseAutoApproveConfig({ VFOS_AUTO_APPROVE: 'on', VFOS_AUTO_APPROVE_ENT: 'off' }),
      { review: true, ent: false },
    );
    assert.deepEqual(
      parseAutoApproveConfig({ VFOS_AUTO_APPROVE: 'off', VFOS_AUTO_APPROVE_REVIEW: 'true' }),
      { review: true, ent: false },
    );
  });
  test('garbage value falls through to default off', () => {
    assert.deepEqual(parseAutoApproveConfig({ VFOS_AUTO_APPROVE: 'maybe' }), {
      review: false,
      ent: false,
    });
  });
  test('empty string → off', () => {
    assert.deepEqual(parseAutoApproveConfig({ VFOS_AUTO_APPROVE: '' }), {
      review: false,
      ent: false,
    });
  });
});

describe('tokenOverlapSimilarity: STT vs script coverage', () => {
  test('identical → 1', () => {
    assert.equal(tokenOverlapSimilarity('xin chào các bạn', 'xin chào các bạn'), 1);
  });
  test('empty reference → 0 (fail-closed upstream)', () => {
    assert.equal(tokenOverlapSimilarity('', 'bất kỳ'), 0);
  });
  test('partial coverage counted over reference tokens', () => {
    // ref has 4 unique tokens; hypothesis covers 2 → 0.5
    assert.equal(tokenOverlapSimilarity('một hai ba bốn', 'một hai năm sáu bảy'), 0.5);
  });
  test('case-insensitive + punctuation ignored', () => {
    assert.equal(tokenOverlapSimilarity('Sản Phẩm, tốt!', 'san... no — không match'), 0);
    assert.equal(tokenOverlapSimilarity('Alpha Beta', 'alpha, beta.'), 1);
  });
});
