/* =============================================================================
 * VFOS — CLI runner đăng TikTok cho lane Giải trí (Phase 3 round 2)
 * -----------------------------------------------------------------------------
 * Gọi ĐÚNG orchestration thật `publishToTikTok` (publish.ts, guard đầy đủ) + client
 * Content Posting thật, nhưng wire deps qua FS (không cần Next server / alias @/).
 * Đọc/ghi proof vào ent_job.json + montage_v2/tiktok_publish.json. KHÔNG log token.
 *
 *   pnpm tsx scripts/ent-vlog/tiktok-publish-run.ts --id ent_squid_001 \
 *       [--ent-dir <abs path data/temp/ent>] [--env <.env>] [--confirm-repost]
 * ========================================================================== */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  type EntTikTokPublishSummary,
  type PublishDeps,
  type PublishJobView,
  type ResolveClientResult,
  publishToTikTok,
} from '../../apps/studio/src/lib/entertainment/publish.ts';
import {
  createMockTikTokPublishClient,
  createTikTokPublishClient,
} from '../../apps/studio/src/lib/tiktok/tiktok-publish-client.ts';

function readJson<T>(p: string): T | null {
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

function resolveClientFromEnv(): ResolveClientResult {
  const mode = (process.env.TIKTOK_MODE || '').trim().toLowerCase();
  if (mode === 'mock') return { ok: true, client: createMockTikTokPublishClient(), mode: 'mock' };
  if (mode !== 'display' && mode !== 'business') {
    return { ok: false, code: 'TIKTOK_DISABLED', message: `TIKTOK_MODE=${mode || 'unset'}.` };
  }
  const token =
    mode === 'display'
      ? (process.env.TIKTOK_ACCESS_TOKEN || '').trim()
      : (process.env.TIKTOK_BUSINESS_ACCESS_TOKEN || '').trim();
  if (!token || !(process.env.TIKTOK_CLIENT_KEY || '').trim()) {
    return { ok: false, code: 'TIKTOK_NOT_CONFIGURED', message: 'Thiếu token/client key.' };
  }
  if ((process.env.TIKTOK_PUBLISH_LIVE || '').trim().toLowerCase() !== 'true') {
    return { ok: false, code: 'LIVE_NOT_ENABLED', message: 'TIKTOK_PUBLISH_LIVE != true.' };
  }
  return { ok: true, client: createTikTokPublishClient({ accessToken: token, mode }), mode };
}

function buildDeps(jobDir: string): PublishDeps {
  const manifestPath = resolve(jobDir, 'ent_job.json');
  const pkgPath = resolve(jobDir, 'montage_v2/package.json');
  return {
    loadJob: (_id): PublishJobView | null => {
      const m = readJson<{
        reviewGates?: { previewApproved?: boolean };
        tiktok?: { status?: string; startedAt?: string };
      }>(manifestPath);
      if (!m) return null;
      const pkg = readJson<{ caption?: string; hashtags?: string[] }>(pkgPath);
      const ambient = resolve(jobDir, 'montage_v2_short_ambient.mp4');
      const short = resolve(jobDir, 'montage_v2_short.mp4');
      const finalVideoAbsPath = existsSync(ambient) ? ambient : existsSync(short) ? short : null;
      return {
        jobId: _id,
        state: 'APPROVED',
        previewApproved: m.reviewGates?.previewApproved === true,
        finalVideoAbsPath,
        caption: pkg?.caption ?? '',
        hashtags: pkg?.hashtags ?? [],
        tiktokStatus: (m.tiktok?.status as PublishJobView['tiktokStatus']) ?? null,
        tiktokStartedAt: m.tiktok?.startedAt ?? null,
        pipelineBusyReason: null,
      };
    },
    saveCaption: (_id, caption, hashtags) => {
      const pkg = readJson<Record<string, unknown>>(pkgPath) ?? {};
      pkg.caption = caption;
      pkg.hashtags = hashtags;
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    },
    setStatus: (_id, summary: EntTikTokPublishSummary) => {
      const m = readJson<Record<string, unknown>>(manifestPath) ?? {};
      m.tiktok = summary;
      m.state =
        summary.status === 'POSTED'
          ? 'TIKTOK_POSTED'
          : summary.status === 'POSTING'
            ? 'TIKTOK_POSTING'
            : 'TIKTOK_FAILED';
      m.updatedAt = new Date().toISOString();
      writeFileSync(manifestPath, JSON.stringify(m, null, 2));
      const trace = resolve(jobDir, 'montage_v2/tiktok_publish.json');
      mkdirSync(dirname(trace), { recursive: true });
      writeFileSync(trace, JSON.stringify(summary, null, 2));
    },
    resolveClient: resolveClientFromEnv,
    now: () => new Date().toISOString(),
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      id: { type: 'string' },
      'ent-dir': { type: 'string' },
      env: { type: 'string' },
      'confirm-repost': { type: 'boolean' },
    },
    strict: false,
  });
  const id = values.id as string;
  if (!id) {
    console.error('🛑 Thiếu --id <jobId>.');
    process.exit(2);
  }
  const envPath = resolve(process.cwd(), (values.env as string) || '.env');
  if (existsSync(envPath)) {
    try {
      (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile(envPath);
    } catch {
      /* .env lỗi format — bỏ qua, resolveClient sẽ báo */
    }
  }
  const entDir = resolve(process.cwd(), (values['ent-dir'] as string) || 'data/temp/ent');
  const jobDir = resolve(entDir, id);
  if (!existsSync(jobDir)) {
    console.error(`🛑 Không thấy job dir: ${jobDir}`);
    process.exit(2);
  }

  console.log(`[tiktok-publish] job=${id} mode=${process.env.TIKTOK_MODE || 'unset'}`);
  const res = await publishToTikTok(buildDeps(jobDir), id, {
    confirmRepost: values['confirm-repost'] === true,
  });

  if (res.ok) {
    console.log('✅ TIKTOK_POSTED');
    console.log(`   mode      : ${res.summary.mode}`);
    console.log(`   publishId : ${res.summary.publishId ?? '-'}`);
    console.log(`   postId    : ${res.summary.postId ?? '-'}`);
    console.log(`   shareUrl  : ${res.summary.shareUrl ?? '-'}`);
    console.log(`   postedAt  : ${res.summary.postedAt ?? '-'}`);
    process.exit(0);
  }
  console.error(`🛑 ${res.code}: ${res.message}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
