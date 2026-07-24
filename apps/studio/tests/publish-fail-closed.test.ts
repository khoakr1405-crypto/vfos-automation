/* =============================================================================
 * VFOS — 2 nhánh FAIL-CLOSED của cổng đăng thật (Phần 82 R-E C1/C2) — vitest.
 * Nợ test ghi ở state doc §11 R-F H3: tsx --test không import được studio →
 * 2 nhánh này chưa từng có test. Vitest + stub fetch/vi.mock đóng nợ mà KHÔNG
 * đổi 1 dòng production (đóng băng publish path tới hết diễn tập).
 *
 *  C1 — tiktok-publish-client: creator_info KHÔNG có privacy an toàn →
 *       `privacy_unavailable`, KHÔNG init/upload (không đoán privacyOptions[0]).
 *  C2 — review-tiktok/publish: live mà thiếu REVIEW_TIKTOK_USERNAME →
 *       `IDENTITY_UNVERIFIABLE` TRƯỚC mọi network/ghi status (G7 fail-closed);
 *       username lệch → `ACCOUNT_IDENTITY_MISMATCH`.
 * Mock toàn bộ IO ngoài (fetch/global, jobs + account-store/vi.mock) — KHÔNG
 * đọc/ghi token store thật, KHÔNG network thật.
 * ========================================================================== */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, describe, test, vi } from 'vitest';

import { createTikTokPublishClient } from '../src/lib/tiktok/tiktok-publish-client.ts';

// ---- C2 module mocks (chỉ hiệu lực trong file này — vitest isolate per-file) ----
vi.mock('@/lib/studio-data/jobs', () => ({
  loadJobById: vi.fn(() => ({ operatorDecision: 'APPROVED' })),
  getJobPreviewAbsPath: vi.fn(() => join(tmpdir(), 'vfos-fake-final.mp4')),
}));
vi.mock('@/lib/tiktok/account-store', () => ({
  getAccountTokens: vi.fn(() => ({ openId: 'x', accessToken: 'sandbox_token_not_real' })),
  isAccountTokenExpired: vi.fn(() => false),
}));

const PROBE_JOB = 'vitest_fail_closed_probe';
// cwd của vitest = apps/studio → repo root = ../../ (cùng logic repoRoot leo marker).
const PROBE_JOB_DIR = resolve(process.cwd(), '..', '..', 'data', 'temp', 'jobs', PROBE_JOB);

afterAll(() => {
  // Test mock-mode đi hết flow → writeStatus ghi status probe vào data/temp (runtime,
  // gitignored). Dọn để: (a) không rác; (b) run sau không dính ALREADY_POSTED (flaky).
  rmSync(PROBE_JOB_DIR, { recursive: true, force: true });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('C1 — privacy fail-closed (tiktok-publish-client)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vfos-c1-'));
  const videoPath = join(dir, 'final.mp4');
  writeFileSync(videoPath, Buffer.alloc(2048, 1));

  test('creator_info KHÔNG có SELF_ONLY lẫn privacy muốn → privacy_unavailable, KHÔNG init', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: { privacy_level_options: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS'] },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createTikTokPublishClient({ accessToken: 'sandbox', mode: 'display' });
    const r = await client.publishVideo({ videoPath, caption: 'test' });

    assert.equal(r.ok, false);
    assert.equal(r.error?.code, 'privacy_unavailable');
    // Fail-closed TRƯỚC init/upload: đúng 1 call (creator_info), không call thứ 2.
    assert.equal(fetchMock.mock.calls.length, 1);
  });

  test('privacy muốn vắng nhưng CÓ SELF_ONLY → hạ về SELF_ONLY (không bao giờ nhặt bừa options[0])', async () => {
    const bodies: string[] = [];
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ''));
      if (bodies.length === 1) {
        // options[0] là PUBLIC — bản lỗi cũ sẽ nhặt cái này.
        return jsonResponse({
          data: { privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'] },
        });
      }
      return jsonResponse({}, 400); // chặn flow sau init — chỉ cần soi body init
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createTikTokPublishClient({ accessToken: 'sandbox', mode: 'display' });
    await client.publishVideo({
      videoPath,
      caption: 'test',
      privacyLevel: 'MUTUAL_FOLLOW_FRIENDS',
    });

    assert.equal(fetchMock.mock.calls.length, 2);
    const initBody = JSON.parse(bodies[1] ?? '{}') as {
      post_info?: { privacy_level?: string };
    };
    assert.equal(initBody.post_info?.privacy_level, 'SELF_ONLY');
  });

  test('creator_info trả options rỗng → từ chối, KHÔNG init', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: { privacy_level_options: [] } }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createTikTokPublishClient({ accessToken: 'sandbox', mode: 'display' });
    const r = await client.publishVideo({ videoPath, caption: 'test' });

    assert.equal(r.ok, false);
    assert.equal(fetchMock.mock.calls.length, 1);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('C2 — identity fail-closed G7 (review-tiktok/publish)', () => {
  function liveEnv(): void {
    vi.stubEnv('TIKTOK_MODE', 'display');
    vi.stubEnv('TIKTOK_CLIENT_KEY', 'sandbox_client_key');
    vi.stubEnv('TIKTOK_PUBLISH_LIVE', 'true');
  }

  test('live + thiếu REVIEW_TIKTOK_USERNAME → IDENTITY_UNVERIFIABLE, ZERO network + ZERO ghi status', async () => {
    liveEnv();
    vi.stubEnv('REVIEW_TIKTOK_USERNAME', '');
    const fetchMock = vi.fn(async () => {
      throw new Error('fetch KHÔNG được phép chạy trong nhánh fail-closed này');
    });
    vi.stubGlobal('fetch', fetchMock);

    const { publishReviewToTikTok } = await import('../src/lib/review-tiktok/publish.ts');
    const r = await publishReviewToTikTok(PROBE_JOB, { caption: 'caption test' });

    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.code, 'IDENTITY_UNVERIFIABLE');
    assert.equal(fetchMock.mock.calls.length, 0); // chặn TRƯỚC mọi network
    // Không được ghi POSTING status cho job probe (fail TRƯỚC writeStatus).
    assert.equal(existsSync(join(PROBE_JOB_DIR, 'tiktok_publish_status.json')), false);
  });

  test('live + username LỆCH token → ACCOUNT_IDENTITY_MISMATCH (đúng 1 call creator_info, không init)', async () => {
    liveEnv();
    vi.stubEnv('REVIEW_TIKTOK_USERNAME', 'vfos_expected_account');
    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: { creator_username: 'someone_else_entirely' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { publishReviewToTikTok } = await import('../src/lib/review-tiktok/publish.ts');
    const r = await publishReviewToTikTok(PROBE_JOB, { caption: 'caption test' });

    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.code, 'ACCOUNT_IDENTITY_MISMATCH');
    assert.equal(fetchMock.mock.calls.length, 1);
  });

  test('mode=mock → KHÔNG đòi username (backward-compat luồng mock)', async () => {
    vi.stubEnv('TIKTOK_MODE', 'mock');
    vi.stubEnv('REVIEW_TIKTOK_USERNAME', '');
    // mock client không network; fetch stub nổ nếu bị gọi.
    const fetchMock = vi.fn(async () => {
      throw new Error('mock mode không được network');
    });
    vi.stubGlobal('fetch', fetchMock);

    const { publishReviewToTikTok } = await import('../src/lib/review-tiktok/publish.ts');
    const r = await publishReviewToTikTok(PROBE_JOB, { caption: 'caption test' });

    // Mock mode đi hết flow (client mock trả POSTED) — điều cần chốt: KHÔNG chặn
    // IDENTITY_UNVERIFIABLE ở mock + không network.
    assert.equal(r.ok, true);
    assert.equal(fetchMock.mock.calls.length, 0);
  });
});
