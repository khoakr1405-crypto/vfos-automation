import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  DEFAULT_TOKEN_WARN_DAYS,
  buildTokenExpiryMeta,
  classifyTokenExpiry,
  parseTokenExpiryMeta,
} from '../src/token-health.ts';

const NOW = Date.parse('2026-06-13T00:00:00Z');
const DAY = 86_400_000;

describe('classifyTokenExpiry', () => {
  test('expiresAt === 0 → never (no block, no warn)', () => {
    const c = classifyTokenExpiry(0, NOW);
    assert.equal(c.status, 'never');
    assert.equal(c.block, false);
    assert.equal(c.daysLeft, null);
  });

  test('null / undefined / negative → unknown (no block)', () => {
    for (const v of [null, undefined, -1, Number.NaN]) {
      const c = classifyTokenExpiry(v as number | null | undefined, NOW);
      assert.equal(c.status, 'unknown', `value ${String(v)}`);
      assert.equal(c.block, false);
    }
  });

  test('already past → expired + block', () => {
    const past = Math.floor((NOW - DAY) / 1000);
    const c = classifyTokenExpiry(past, NOW);
    assert.equal(c.status, 'expired');
    assert.equal(c.block, true);
    assert.ok((c.daysLeft ?? 0) <= 0);
  });

  test('within warn window (< 7 days) → expiring_soon, no block', () => {
    const soon = Math.floor((NOW + 3 * DAY) / 1000);
    const c = classifyTokenExpiry(soon, NOW);
    assert.equal(c.status, 'expiring_soon');
    assert.equal(c.block, false);
    assert.equal(c.daysLeft, 3);
  });

  test('boundary: exactly warnDays away → healthy (not warned)', () => {
    const at = Math.floor((NOW + DEFAULT_TOKEN_WARN_DAYS * DAY) / 1000);
    const c = classifyTokenExpiry(at, NOW);
    assert.equal(c.status, 'healthy');
  });

  test('far future (~59 days) → healthy', () => {
    const far = Math.floor((NOW + 59 * DAY) / 1000);
    const c = classifyTokenExpiry(far, NOW);
    assert.equal(c.status, 'healthy');
    assert.equal(c.block, false);
    assert.equal(c.daysLeft, 59);
  });

  test('custom warnDays widens warning window', () => {
    const in10 = Math.floor((NOW + 10 * DAY) / 1000);
    assert.equal(classifyTokenExpiry(in10, NOW, 7).status, 'healthy');
    assert.equal(classifyTokenExpiry(in10, NOW, 14).status, 'expiring_soon');
  });
});

describe('buildTokenExpiryMeta', () => {
  test('expiresAt > 0 → iso filled, no token field', () => {
    const at = Math.floor((NOW + 59 * DAY) / 1000);
    const m = buildTokenExpiryMeta(
      '1169116176282221',
      at,
      '2026-06-13T00:00:00.000Z',
      'get-page-token',
    );
    assert.equal(m.pageId, '1169116176282221');
    assert.equal(m.expiresAt, at);
    assert.ok(m.expiresAtIso?.startsWith('2026-08'));
    assert.equal(m.source, 'get-page-token');
    assert.ok(!('token' in m) && !('accessToken' in m));
  });

  test('expiresAt === 0 → iso null', () => {
    const m = buildTokenExpiryMeta('p', 0, '2026-06-13T00:00:00.000Z', 'get-page-token');
    assert.equal(m.expiresAtIso, null);
  });
});

describe('parseTokenExpiryMeta', () => {
  test('valid round-trips', () => {
    const at = Math.floor((NOW + 30 * DAY) / 1000);
    const built = buildTokenExpiryMeta('p', at, '2026-06-13T00:00:00.000Z', 'get-page-token');
    const parsed = parseTokenExpiryMeta(JSON.parse(JSON.stringify(built)));
    assert.deepEqual(parsed, built);
  });

  test('bad shapes → null', () => {
    assert.equal(parseTokenExpiryMeta(null), null);
    assert.equal(parseTokenExpiryMeta('x'), null);
    assert.equal(parseTokenExpiryMeta({ pageId: 'p' }), null);
    assert.equal(parseTokenExpiryMeta({ expiresAt: 1 }), null);
  });
});
