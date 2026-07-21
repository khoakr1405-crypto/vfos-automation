import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  buildAuthUrl,
  expiresAtFrom,
  redact,
  upsertAccountStoreContent,
  upsertEnvContent,
} from '../scripts/tiktok-oauth-helper.ts';

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

describe('upsertAccountStoreContent (Phần 79 — cầu token account-store)', () => {
  const ENTRY = {
    openId: 'open123',
    accessToken: 'act_abc',
    refreshToken: 'rft_xyz',
    expiresAt: '2026-07-17T00:00:00.000Z',
  };

  test('store rỗng/hỏng → tạo mới với đúng 1 account', () => {
    for (const content of ['', 'not-json{{{', '[]']) {
      const out = JSON.parse(upsertAccountStoreContent(content, 'tt_review_main', ENTRY));
      assert.deepEqual(Object.keys(out), ['tt_review_main']);
      assert.equal(out.tt_review_main.accessToken, 'act_abc');
      assert.equal(out.tt_review_main.openId, 'open123');
    }
  });

  test('KHÔNG đè account khác (token ENT giữ nguyên)', () => {
    const existing = JSON.stringify({
      tt_fishing_main: { openId: 'ent1', accessToken: 'ent_token' },
    });
    const out = JSON.parse(upsertAccountStoreContent(existing, 'tt_review_main', ENTRY));
    assert.equal(out.tt_fishing_main.accessToken, 'ent_token');
    assert.equal(out.tt_review_main.accessToken, 'act_abc');
  });

  test('gọi lại cùng account → thay token, không nhân đôi key', () => {
    let content = upsertAccountStoreContent('', 'tt_review_main', ENTRY);
    content = upsertAccountStoreContent(content, 'tt_review_main', {
      ...ENTRY,
      accessToken: 'act_moi',
    });
    const out = JSON.parse(content);
    assert.deepEqual(Object.keys(out), ['tt_review_main']);
    assert.equal(out.tt_review_main.accessToken, 'act_moi');
  });

  test('field optional rỗng thì KHÔNG ghi (không rác undefined)', () => {
    const out = JSON.parse(
      upsertAccountStoreContent('', 'tt_x', { openId: 'o', accessToken: 'a' }),
    );
    assert.equal('refreshToken' in out.tt_x, false);
    assert.equal('expiresAt' in out.tt_x, false);
  });

  test('refreshRejectedAt persist khi set + TỰ CLEAR khi ghi entry mới (H2)', () => {
    // Đánh dấu refresh_token chết → mốc persist (tick sẽ skip re-poll).
    const marked = JSON.parse(
      upsertAccountStoreContent('', 'tt_review_main', {
        ...ENTRY,
        refreshRejectedAt: '2026-07-21T00:00:00.000Z',
      }),
    );
    assert.equal(marked.tt_review_main.refreshRejectedAt, '2026-07-21T00:00:00.000Z');
    // Đường success/exchange ghi entry MỚI không có mốc → tự CLEAR (không kẹt SUSPENDED).
    const cleared = JSON.parse(
      upsertAccountStoreContent(JSON.stringify(marked), 'tt_review_main', ENTRY),
    );
    assert.equal('refreshRejectedAt' in cleared.tt_review_main, false);
  });
});

describe('expiresAtFrom', () => {
  test('expires_in hợp lệ → ISO đúng mốc now + n giây', () => {
    const now = Date.parse('2026-07-16T00:00:00.000Z');
    assert.equal(expiresAtFrom(now, 3600), '2026-07-16T01:00:00.000Z');
  });
  test('thiếu/0/âm/NaN → undefined (store coi như không hạn)', () => {
    const now = Date.parse('2026-07-16T00:00:00.000Z');
    assert.equal(expiresAtFrom(now, undefined), undefined);
    assert.equal(expiresAtFrom(now, 0), undefined);
    assert.equal(expiresAtFrom(now, -5), undefined);
    assert.equal(expiresAtFrom(now, Number.NaN), undefined);
  });
});
