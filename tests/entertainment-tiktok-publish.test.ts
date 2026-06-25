import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  type EntTikTokPublishSummary,
  type PublishChannelView,
  type PublishDeps,
  type PublishJobView,
  type ResolveClientResult,
  computeReadiness,
  publishToTikTok,
} from '../apps/studio/src/lib/entertainment/publish.ts';
import { createMockTikTokPublishClient } from '../apps/studio/src/lib/tiktok/tiktok-publish-client.ts';

const NOW = '2026-06-23T00:00:00.000Z';

function baseView(over: Partial<PublishJobView> = {}): PublishJobView {
  return {
    jobId: 'ent_fishing_test',
    state: 'APPROVED',
    channelId: 'ch_test',
    accountId: 'tt_test',
    niche: 'fishing-vlog',
    previewApproved: true,
    finalVideoAbsPath: '/abs/data/temp/ent/ent_fishing_test/montage_v2_short_ambient.mp4',
    caption: 'Ra biển câu mực, lên hàng là mê luôn 🎣',
    hashtags: ['#cauca', '#fyp'],
    tiktokStatus: null,
    tiktokStartedAt: null,
    pipelineBusyReason: null,
    ...over,
  };
}

function baseChannel(over: Partial<PublishChannelView> = {}): PublishChannelView {
  return {
    channelId: 'ch_test',
    accountId: 'tt_test',
    niche: 'fishing-vlog',
    tiktokUsername: 'tester',
    status: 'active',
    allowedContentTypes: ['fishing-vlog'],
    topicMismatchPolicy: 'warn',
    ...over,
  };
}

interface DepsOpts {
  view?: Partial<PublishJobView>;
  loadJobNull?: boolean;
  channel?: Partial<PublishChannelView>;
  loadChannelNull?: boolean;
  resolveClientForAccount?: (accountId: string) => ResolveClientResult;
  verifyIdentity?: (accountId: string, expectedUsername: string) => Promise<{ ok: boolean; reason?: string }>;
  mockFail?: { code: string; message: string };
}

function makeDeps(opts: DepsOpts = {}) {
  const calls = {
    setStatus: [] as EntTikTokPublishSummary[],
    saveCaption: [] as Array<{ caption: string; hashtags: string[] }>,
    resolvedAccounts: [] as string[],
  };
  const view = baseView(opts.view);
  const channel = baseChannel(opts.channel);
  const deps: PublishDeps = {
    loadJob: () => (opts.loadJobNull ? null : view),
    loadChannel: () => (opts.loadChannelNull ? null : channel),
    saveCaption: (_id, caption, hashtags) => {
      calls.saveCaption.push({ caption, hashtags });
    },
    setStatus: (_id, summary) => {
      calls.setStatus.push(summary);
    },
    resolveClientForAccount:
      opts.resolveClientForAccount ??
      ((accountId) => {
        calls.resolvedAccounts.push(accountId);
        return {
          ok: true,
          client: createMockTikTokPublishClient(opts.mockFail ? { fail: opts.mockFail } : undefined),
          mode: 'mock',
        };
      }),
    verifyAccountIdentity: opts.verifyIdentity ?? (async () => ({ ok: true })),
    now: () => NOW,
  };
  return { deps, calls, view, channel };
}

describe('computeReadiness — 5 đèn', () => {
  test('đủ điều kiện → allReady', () => {
    const r = computeReadiness(baseView(), true);
    assert.equal(r.videoApproved, true);
    assert.equal(r.hasFinalVideo, true);
    assert.equal(r.hasCaption, true);
    assert.equal(r.tiktokApiReady, true);
    assert.equal(r.notPosted, true);
    assert.equal(r.allReady, true);
  });
  test('env chưa sẵn sàng → allReady false', () => {
    assert.equal(computeReadiness(baseView(), false).allReady, false);
  });
  test('đã posted → notPosted false, allReady false', () => {
    const r = computeReadiness(baseView({ tiktokStatus: 'POSTED' }), true);
    assert.equal(r.notPosted, false);
    assert.equal(r.allReady, false);
  });
  test('caption rỗng → hasCaption false', () => {
    assert.equal(computeReadiness(baseView({ caption: '' }), true).hasCaption, false);
  });
});

describe('publishToTikTok — guard chặn (không gọi client, không POSTED)', () => {
  test('job không tồn tại → NOT_FOUND', async () => {
    const { deps, calls } = makeDeps({ loadJobNull: true });
    const r = await publishToTikTok(deps, 'ent_x');
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.code, 'NOT_FOUND');
    assert.equal(calls.setStatus.length, 0);
  });

  test('video chưa duyệt → NO_PREVIEW_GATE', async () => {
    const { deps, calls } = makeDeps({ view: { previewApproved: false } });
    const r = await publishToTikTok(deps, 'ent_x');
    assert.equal(r.ok === false && r.code, 'NO_PREVIEW_GATE');
    assert.equal(calls.setStatus.length, 0);
  });

  test('thiếu final video → NO_FINAL', async () => {
    const { deps } = makeDeps({ view: { finalVideoAbsPath: null } });
    const r = await publishToTikTok(deps, 'ent_x');
    assert.equal(r.ok === false && r.code, 'NO_FINAL');
  });

  test('caption rỗng + không nhập → NO_CAPTION', async () => {
    const { deps, calls } = makeDeps({ view: { caption: '' } });
    const r = await publishToTikTok(deps, 'ent_x');
    assert.equal(r.ok === false && r.code, 'NO_CAPTION');
    assert.equal(calls.saveCaption.length, 0);
  });

  test('caption rỗng NHƯNG Operator nhập caption → đăng được', async () => {
    const { deps, calls } = makeDeps({ view: { caption: '' } });
    const r = await publishToTikTok(deps, 'ent_x', { caption: 'Caption Operator nhập tay' });
    assert.equal(r.ok, true);
    assert.equal(calls.saveCaption[0]?.caption, 'Caption Operator nhập tay');
  });

  test('thiếu env/token → TIKTOK_NOT_CONFIGURED, không gọi client', async () => {
    const { deps, calls } = makeDeps({
      resolveClientForAccount: () => ({
        ok: false,
        code: 'TIKTOK_NOT_CONFIGURED',
        message: 'Thiếu cấu hình TikTok: TIKTOK_ACCESS_TOKEN.',
      }),
    });
    const r = await publishToTikTok(deps, 'ent_x');
    assert.equal(r.ok === false && r.code, 'TIKTOK_NOT_CONFIGURED');
    assert.equal(calls.setStatus.length, 0);
  });

  test('live chưa bật → LIVE_NOT_ENABLED', async () => {
    const { deps } = makeDeps({
      resolveClientForAccount: () => ({
        ok: false,
        code: 'LIVE_NOT_ENABLED',
        message: 'Chưa bật live.',
      }),
    });
    const r = await publishToTikTok(deps, 'ent_x');
    assert.equal(r.ok === false && r.code, 'LIVE_NOT_ENABLED');
  });

  test('job đã posted, không confirmRepost → ALREADY_POSTED', async () => {
    const { deps } = makeDeps({ view: { tiktokStatus: 'POSTED' } });
    const r = await publishToTikTok(deps, 'ent_x');
    assert.equal(r.ok === false && r.code, 'ALREADY_POSTED');
  });

  test('confirmRepost=true → cho đăng lại', async () => {
    const { deps } = makeDeps({ view: { tiktokStatus: 'POSTED' } });
    const r = await publishToTikTok(deps, 'ent_x', { confirmRepost: true });
    assert.equal(r.ok, true);
  });

  test('đang POSTING (mới) → PUBLISH_BUSY', async () => {
    const { deps } = makeDeps({
      view: { tiktokStatus: 'POSTING', tiktokStartedAt: new Date().toISOString() },
    });
    const r = await publishToTikTok(deps, 'ent_x');
    assert.equal(r.ok === false && r.code, 'PUBLISH_BUSY');
  });

  test('pipeline đang chạy → BUSY', async () => {
    const { deps } = makeDeps({ view: { pipelineBusyReason: 'Đang chạy "produce".' } });
    const r = await publishToTikTok(deps, 'ent_x');
    assert.equal(r.ok === false && r.code, 'BUSY');
  });
});

describe('publishToTikTok — kết quả client', () => {
  test('client lỗi → TIKTOK_API_ERROR, ghi FAILED, KHÔNG POSTED (no fake success)', async () => {
    const { deps, calls } = makeDeps({ mockFail: { code: 'spam_risk_too_many', message: 'spam' } });
    const r = await publishToTikTok(deps, 'ent_x');
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.code, 'TIKTOK_API_ERROR');
    const last = calls.setStatus.at(-1);
    assert.equal(last?.status, 'FAILED');
    assert.equal(
      calls.setStatus.some((s) => s.status === 'POSTED'),
      false,
    );
  });

  test('token hết hạn → TIKTOK_AUTH_EXPIRED', async () => {
    const { deps } = makeDeps({ mockFail: { code: 'auth_expired', message: 'token expired' } });
    const r = await publishToTikTok(deps, 'ent_x');
    assert.equal(r.ok === false && r.code, 'TIKTOK_AUTH_EXPIRED');
  });

  test('thành công → TIKTOK_POSTED + proof + saveCaption + POSTING trước POSTED', async () => {
    const { deps, calls } = makeDeps();
    const r = await publishToTikTok(deps, 'ent_x');
    assert.equal(r.ok, true);
    assert.equal(r.ok === true && r.summary.status, 'POSTED');
    assert.equal(r.ok === true && !!r.summary.postId, true);
    assert.equal(calls.saveCaption.length, 1);
    assert.equal(calls.setStatus[0]?.status, 'POSTING');
    assert.equal(calls.setStatus.at(-1)?.status, 'POSTED');
    assert.equal(calls.setStatus.at(-1)?.mode, 'mock');
  });
});

describe('isolation — không import scope cấm', () => {
  const FORBIDDEN =
    /(product-review|shopee|facebook|commerce|growth|vfos-job-manager|review-video-orchestrator|review-orchestrator)/i;
  const files = [
    '../apps/studio/src/lib/entertainment/publish.ts',
    '../apps/studio/src/lib/tiktok/tiktok-publish-client.ts',
    '../apps/studio/src/app/api/studio/entertainment/jobs/[jobId]/tiktok-publish/route.ts',
    '../apps/studio/src/app/api/studio/entertainment/jobs/[jobId]/tiktok-readiness/route.ts',
    '../apps/studio/src/components/entertainment/package-panel.tsx',
  ];
  for (const rel of files) {
    test(`không import cấm: ${rel.split('/').pop()}`, () => {
      const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
      const importLines = src.split('\n').filter((l) => /^\s*(import|export).*from\s+['"]/.test(l));
      for (const line of importLines) {
        assert.equal(FORBIDDEN.test(line), false, `import cấm trong ${rel}: ${line.trim()}`);
      }
    });
  }
});
