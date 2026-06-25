/* =============================================================================
 * VFOS — Entertainment multi-channel guards (R1) — node:test (pure/DI, no live).
 * Bảo chứng chống ĐĂNG NHẦM KÊNH: video kênh A chỉ đăng đúng account A.
 *   G1 NO_CHANNEL_BINDING · G2 CHANNEL_UNKNOWN · CROSS_POST_DENIED ·
 *   G3 CHANNEL_MISMATCH · G5 ACCOUNT_INACTIVE · G7 ACCOUNT_IDENTITY_MISMATCH ·
 *   G8 TOPIC_NOT_ALLOWED · G4 resolve-by-account (đích theo job, KHÔNG theo UI).
 * ========================================================================== */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  type EntTikTokPublishSummary,
  type PublishChannelView,
  type PublishDeps,
  type PublishInput,
  type PublishJobView,
  type ResolveClientResult,
  publishToTikTok,
} from '../apps/studio/src/lib/entertainment/publish.ts';
import { createMockTikTokPublishClient } from '../apps/studio/src/lib/tiktok/tiktok-publish-client.ts';

const NOW = '2026-06-25T00:00:00.000Z';

function view(over: Partial<PublishJobView> = {}): PublishJobView {
  return {
    jobId: 'ent_fishing_mc',
    state: 'APPROVED',
    channelId: 'ch_fishing',
    accountId: 'tt_fishing_main',
    niche: 'fishing-vlog',
    previewApproved: true,
    finalVideoAbsPath: '/abs/ent_fishing_mc/montage_v2_short_ambient.mp4',
    caption: 'Pha kéo cá lên khỏi mặt nước này mà hụt là tiếc cả ngày 🎣',
    hashtags: ['#cauca'],
    tiktokStatus: null,
    tiktokStartedAt: null,
    pipelineBusyReason: null,
    ...over,
  };
}

function channel(over: Partial<PublishChannelView> = {}): PublishChannelView {
  return {
    channelId: 'ch_fishing',
    accountId: 'tt_fishing_main',
    niche: 'fishing-vlog',
    tiktokUsername: 'chuyenvuidoday10',
    status: 'active',
    allowedContentTypes: ['fishing-vlog'],
    topicMismatchPolicy: 'warn',
    ...over,
  };
}

interface Opts {
  view?: Partial<PublishJobView>;
  channel?: Partial<PublishChannelView> | null;
  resolveClientForAccount?: (accountId: string) => ResolveClientResult;
  verifyIdentity?: (accountId: string, expected: string) => Promise<{ ok: boolean; reason?: string }>;
}

function deps(opts: Opts = {}) {
  const calls = {
    resolvedAccounts: [] as string[],
    setStatus: [] as EntTikTokPublishSummary[],
  };
  const ch = opts.channel === null ? null : channel(opts.channel ?? {});
  const d: PublishDeps = {
    loadJob: () => view(opts.view),
    loadChannel: () => ch,
    saveCaption: () => {},
    setStatus: (_id, s) => {
      calls.setStatus.push(s);
    },
    resolveClientForAccount:
      opts.resolveClientForAccount ??
      ((accountId) => {
        calls.resolvedAccounts.push(accountId);
        return { ok: true, client: createMockTikTokPublishClient(), mode: 'mock' };
      }),
    verifyAccountIdentity: opts.verifyIdentity ?? (async () => ({ ok: true })),
    now: () => NOW,
  };
  return { d, calls };
}

const run = (o: Opts, input: PublishInput = {}) => publishToTikTok(deps(o).d, 'ent_fishing_mc', input);

describe('multi-channel guards — chống đăng nhầm kênh', () => {
  test('T1 — job chưa bind kênh (channelId null) → NO_CHANNEL_BINDING', async () => {
    const r = await run({ view: { channelId: null } });
    assert.equal(r.ok === false && r.code, 'NO_CHANNEL_BINDING');
  });

  test('T6 — job thiếu accountId → CROSS_POST_DENIED (không xác định đích)', async () => {
    const r = await run({ view: { accountId: null } });
    assert.equal(r.ok === false && r.code, 'CROSS_POST_DENIED');
  });

  test('T2/G2 — channelId không có trong registry → CHANNEL_UNKNOWN', async () => {
    const r = await run({ view: { channelId: 'ch_ghost' }, channel: null });
    assert.equal(r.ok === false && r.code, 'CHANNEL_UNKNOWN');
  });

  test('cross-post — job.accountId ≠ account của kênh → CROSS_POST_DENIED', async () => {
    const r = await run({ view: { accountId: 'tt_xe' }, channel: { accountId: 'tt_fishing_main' } });
    assert.equal(r.ok === false && r.code, 'CROSS_POST_DENIED');
  });

  test('T3 — selectedChannelId ≠ job.channelId → CHANNEL_MISMATCH', async () => {
    const r = await run({}, { selectedChannelId: 'ch_xe' });
    assert.equal(r.ok === false && r.code, 'CHANNEL_MISMATCH');
  });

  test('T5 — kênh inactive → ACCOUNT_INACTIVE', async () => {
    const r = await run({ channel: { status: 'inactive' } });
    assert.equal(r.ok === false && r.code, 'ACCOUNT_INACTIVE');
  });

  test('T10 — niche ngoài allowedContentTypes + policy block → TOPIC_NOT_ALLOWED', async () => {
    const r = await run({
      view: { niche: 'car-vlog' },
      channel: { allowedContentTypes: ['fishing-vlog'], topicMismatchPolicy: 'block' },
    });
    assert.equal(r.ok === false && r.code, 'TOPIC_NOT_ALLOWED');
  });

  test('niche ngoài allowed nhưng policy warn → vẫn đăng được', async () => {
    const r = await run({
      view: { niche: 'car-vlog' },
      channel: { allowedContentTypes: ['fishing-vlog'], topicMismatchPolicy: 'warn' },
    });
    assert.equal(r.ok, true);
  });

  test('T4/G7 — token không khớp account kênh → ACCOUNT_IDENTITY_MISMATCH', async () => {
    const r = await run({ verifyIdentity: async () => ({ ok: false, reason: '@other != @x' }) });
    assert.equal(r.ok === false && r.code, 'ACCOUNT_IDENTITY_MISMATCH');
  });

  test('T9 — token account hết hạn → TIKTOK_AUTH_EXPIRED', async () => {
    const r = await run({
      resolveClientForAccount: () => ({
        ok: false,
        code: 'TIKTOK_AUTH_EXPIRED',
        message: 'Token hết hạn.',
      }),
    });
    assert.equal(r.ok === false && r.code, 'TIKTOK_AUTH_EXPIRED');
  });

  test('G4 — resolve client THEO accountId BIND CỦA JOB (không theo UI)', async () => {
    const { d, calls } = deps({
      view: { channelId: 'ch_xe', accountId: 'tt_xe' },
      channel: { channelId: 'ch_xe', accountId: 'tt_xe', niche: 'car-vlog', tiktokUsername: 'xe' },
    });
    const r = await publishToTikTok(d, 'ent_fishing_mc', { selectedChannelId: 'ch_xe' });
    assert.equal(r.ok, true);
    assert.deepEqual(calls.resolvedAccounts, ['tt_xe']); // resolve đúng account của job
    assert.equal(calls.setStatus.at(-1)?.accountId, 'tt_xe'); // proof account đã đăng
  });

  test('T7 — đúng kênh + selectedChannel khớp + identity ok → publish allowed (POSTED)', async () => {
    const { d, calls } = deps({});
    const r = await publishToTikTok(d, 'ent_fishing_mc', { selectedChannelId: 'ch_fishing' });
    assert.equal(r.ok, true);
    assert.equal(r.ok === true && r.summary.status, 'POSTED');
    assert.deepEqual(calls.resolvedAccounts, ['tt_fishing_main']);
  });
});

describe('isolation + secret — file multi-channel không import scope cấm', () => {
  const FORBIDDEN =
    /(product-review|shopee|facebook|commerce|growth|vfos-job-manager|review-video-orchestrator|review-orchestrator)/i;
  const files = [
    '../apps/studio/src/lib/entertainment/channels.ts',
    '../apps/studio/src/lib/tiktok/account-store.ts',
    '../apps/studio/src/lib/entertainment/publish.ts',
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

  test('account-store KHÔNG console.log (không rò token)', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../apps/studio/src/lib/tiktok/account-store.ts', import.meta.url)),
      'utf8',
    );
    assert.equal(/console\.(log|info|debug|warn|error)/.test(src), false);
  });
});
