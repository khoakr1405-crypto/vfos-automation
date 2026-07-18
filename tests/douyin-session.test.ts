import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { isLoginWallUrl } from '../scripts/ent-vlog/lib/douyin-fetch.ts';
import {
  type DouyinLoginStatus,
  douyinLoginStatusPath,
  isFreshStatus,
  readDouyinLoginStatus,
  writeDouyinLoginStatus,
} from '../scripts/ent-vlog/lib/douyin-login-status.ts';

describe('isLoginWallUrl: nhận diện redirect login/security', () => {
  test('URL passport/login/security → true', () => {
    assert.equal(isLoginWallUrl('https://passport.douyin.com/login'), true);
    assert.equal(isLoginWallUrl('https://www.douyin.com/passport/web/login/'), true);
    assert.equal(isLoginWallUrl('https://www.douyin.com/security-check?x=1'), true);
    assert.equal(isLoginWallUrl('https://www.douyin.com/user/login'), true);
    assert.equal(isLoginWallUrl('https://www.douyin.com/video/7?need_login=1'), true);
    assert.equal(isLoginWallUrl('https://www.douyin.com/video/7?needlogin=1'), true);
  });

  test('URL video/trang thường → false (không dương tính giả)', () => {
    assert.equal(isLoginWallUrl('https://www.douyin.com/video/7412345678901234567'), false);
    assert.equal(isLoginWallUrl('https://www.douyin.com/'), false);
    assert.equal(isLoginWallUrl('https://www.douyin.com/user/MS4wLjAB?tab=post'), false);
  });
});

describe('douyin-login-status: ghi/đọc roundtrip + validate', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'vfos-douyin-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const sample: DouyinLoginStatus = {
    state: 'CLOSED',
    openedAt: '2026-07-18T10:00:00.000Z',
    closedAt: '2026-07-18T10:02:30.000Z',
    pid: 12345,
    generatedAt: '2026-07-18T10:02:30.000Z',
  };

  test('write rồi read ra đúng object (tạo thư mục data/temp)', () => {
    writeDouyinLoginStatus(root, sample);
    const got = readDouyinLoginStatus(root);
    assert.deepEqual(got, sample);
  });

  test('chưa có file → null', () => {
    assert.equal(readDouyinLoginStatus(root), null);
  });

  test('JSON hỏng → null (không ném)', () => {
    writeDouyinLoginStatus(root, sample); // tạo thư mục data/temp trước
    writeFileSync(douyinLoginStatusPath(root), '{ hỏng', 'utf8');
    assert.equal(readDouyinLoginStatus(root), null);
  });

  test('sai shape (thiếu state hợp lệ) → null', () => {
    writeDouyinLoginStatus(root, sample);
    writeFileSync(
      douyinLoginStatusPath(root),
      JSON.stringify({ state: 'BOGUS', generatedAt: 'x' }),
      'utf8',
    );
    assert.equal(readDouyinLoginStatus(root), null);
  });
});

describe('isFreshStatus: chống đọc artifact login CŨ', () => {
  const base: DouyinLoginStatus = {
    state: 'CLOSED',
    openedAt: '2026-07-18T10:00:00.000Z',
    closedAt: '2026-07-18T10:00:10.000Z',
    pid: 1,
    generatedAt: '2026-07-18T10:00:10.000Z',
  };
  const now = Date.parse('2026-07-18T10:05:00.000Z'); // 4m50s sau generatedAt
  const MAX = 15 * 60_000;

  test('trong cửa sổ maxAge → fresh', () => {
    assert.equal(isFreshStatus(base, now, MAX), true);
  });

  test('quá maxAge (login lần trước) → stale', () => {
    const old = { ...base, generatedAt: '2026-07-18T09:40:00.000Z' }; // 25' trước
    assert.equal(isFreshStatus(old, now, MAX), false);
  });

  test('generatedAt không parse được → false', () => {
    assert.equal(isFreshStatus({ ...base, generatedAt: 'not-a-date' }, now, MAX), false);
  });

  test('lệch đồng hồ nhẹ (generatedAt hơi tương lai) vẫn chấp nhận', () => {
    const slightFuture = { ...base, generatedAt: '2026-07-18T10:05:03.000Z' }; // +3s
    assert.equal(isFreshStatus(slightFuture, now, MAX), true);
  });
});
