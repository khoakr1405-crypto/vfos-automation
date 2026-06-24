import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { buildAuthUrl, redact, upsertEnvContent } from '../scripts/tiktok-oauth-helper.ts';

describe('buildAuthUrl', () => {
  test('chứa đủ tham số OAuth + scope video.publish', () => {
    const url = buildAuthUrl({
      clientKey: 'awxyz',
      redirectUri: 'https://example.com/cb',
      state: 's1',
    });
    const u = new URL(url);
    assert.equal(u.origin + u.pathname, 'https://www.tiktok.com/v2/auth/authorize/');
    assert.equal(u.searchParams.get('client_key'), 'awxyz');
    assert.equal(u.searchParams.get('scope'), 'video.publish');
    assert.equal(u.searchParams.get('response_type'), 'code');
    assert.equal(u.searchParams.get('redirect_uri'), 'https://example.com/cb');
    assert.equal(u.searchParams.get('state'), 's1');
  });
  test('scope tuỳ chỉnh được', () => {
    const url = buildAuthUrl({
      clientKey: 'k',
      redirectUri: 'https://e/cb',
      scope: 'video.publish,video.upload',
    });
    assert.equal(new URL(url).searchParams.get('scope'), 'video.publish,video.upload');
  });
});

describe('upsertEnvContent', () => {
  test('thay dòng có sẵn (uncommented)', () => {
    const out = upsertEnvContent('A=1\nTIKTOK_MODE=mock\nB=2\n', { TIKTOK_MODE: 'display' });
    assert.match(out, /^TIKTOK_MODE=display$/m);
    assert.equal(/TIKTOK_MODE=mock/.test(out), false);
    assert.match(out, /^A=1$/m);
    assert.match(out, /^B=2$/m);
  });
  test('thay dòng đang bị comment', () => {
    const out = upsertEnvContent('# TIKTOK_CLIENT_KEY=...\n', { TIKTOK_CLIENT_KEY: 'realkey' });
    assert.match(out, /^TIKTOK_CLIENT_KEY=realkey$/m);
    assert.equal(/#\s*TIKTOK_CLIENT_KEY/.test(out), false);
  });
  test('append key chưa có', () => {
    const out = upsertEnvContent('A=1\n', { TIKTOK_ACCESS_TOKEN: 'tok', TIKTOK_OPEN_ID: 'oid' });
    assert.match(out, /^TIKTOK_ACCESS_TOKEN=tok$/m);
    assert.match(out, /^TIKTOK_OPEN_ID=oid$/m);
    assert.match(out, /^A=1$/m);
  });
  test('không nhân đôi key khi gọi nhiều lần', () => {
    let out = upsertEnvContent('', { TIKTOK_ACCESS_TOKEN: 'a' });
    out = upsertEnvContent(out, { TIKTOK_ACCESS_TOKEN: 'b' });
    assert.equal((out.match(/TIKTOK_ACCESS_TOKEN=/g) ?? []).length, 1);
    assert.match(out, /^TIKTOK_ACCESS_TOKEN=b$/m);
  });
});

describe('redact', () => {
  test('chỉ lộ độ dài, không lộ giá trị', () => {
    assert.equal(redact('secrettoken'), '<len=11>');
    assert.equal(redact(''), '<absent>');
    assert.equal(redact(undefined), '<absent>');
  });
});
