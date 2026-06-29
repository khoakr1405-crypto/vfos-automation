// Durable channel (creator-profile) lister for the entertainment lane source binding.
// ---------------------------------------------------------------------------
// WHY: each niche/channel is bound to a FIXED Chinese creator (Douyin/TikTok TQ).
// Pressing "Tải link" should list that creator's recent videos so the Operator picks
// one (or auto-takes the newest un-reused) instead of hunting + pasting URLs by hand.
//
// Douyin: reuse the SAME persistent, trust-accumulated browser profile as the per-video
// fetcher; capture the web post-list API JSON (robust, structured) rather than scraping
// brittle DOM. Captcha → CAPTCHA (operator clears once via `pnpm ent:douyin-login`).
// TikTok(.com): yt-dlp --flat-playlist (already a dependency in 01-fetch-source).
//
// READ-ONLY: lists metadata, downloads NO media. NO secrets logged; cookie VALUES
// never printed — only counts/ids of public posts.
import { spawnSync } from 'node:child_process';
import { douyinProfileDir, douyinUserAgent, hasCaptchaWall } from './douyin-fetch.js';

export interface ChannelVideo {
  /** Canonical video-page URL (what we hand to 01-fetch-source). */
  url: string;
  /** Platform video id (for dedup). null when only a share link is known. */
  videoId: string | null;
  title?: string;
  durationSec?: number;
  thumbnail?: string;
}

export type ListResult =
  | { ok: true; videos: ChannelVideo[] }
  | {
      ok: false;
      code: 'CAPTCHA' | 'NO_VIDEOS' | 'NAV_FAILED' | 'BAD_PLATFORM' | 'LIST_FAILED';
      message: string;
    };

const DOUYIN_POST_API = /aweme\/v1\/web\/aweme\/post|aweme\/post\//i;

interface DouyinAweme {
  aweme_id?: string;
  desc?: string;
  video?: { duration?: number; cover?: { url_list?: string[] } };
}

/** List a creator's recent videos. Dispatches by platform. */
export async function listChannelVideos(opts: {
  url: string;
  platform: 'douyin' | 'tiktok';
  limit?: number;
  headful?: boolean;
}): Promise<ListResult> {
  const limit = opts.limit ?? 12;
  if (opts.platform === 'tiktok') return listTikTokChannel(opts.url, limit);
  if (opts.platform === 'douyin') return listDouyinChannel(opts.url, limit, opts.headful);
  return { ok: false, code: 'BAD_PLATFORM', message: `platform không hỗ trợ: ${opts.platform}` };
}

/** Douyin: drive the persistent browser, capture the post-list API JSON, fall back to
 * DOM anchors if the API shape changed. Same captcha gate as the per-video fetcher. */
async function listDouyinChannel(
  url: string,
  limit: number,
  headful?: boolean,
): Promise<ListResult> {
  const { chromium } = await import('playwright');
  const context = await chromium.launchPersistentContext(douyinProfileDir(), {
    headless: !headful,
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    userAgent: douyinUserAgent(),
    args: ['--disable-blink-features=AutomationControlled'],
  });

  // De-dup by aweme_id, preserve first-seen order (newest first as the feed loads).
  const seen = new Map<string, ChannelVideo>();
  const collect = (list: DouyinAweme[]) => {
    for (const a of list) {
      const id = (a.aweme_id ?? '').trim();
      if (!id || seen.has(id)) continue;
      seen.set(id, {
        url: `https://www.douyin.com/video/${id}`,
        videoId: id,
        title: a.desc?.trim() || undefined,
        durationSec:
          typeof a.video?.duration === 'number' ? Math.round(a.video.duration / 1000) : undefined,
        thumbnail: a.video?.cover?.url_list?.[0],
      });
    }
  };

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    page.on('response', (r) => {
      if (!DOUYIN_POST_API.test(r.url())) return;
      void r
        .json()
        .then((j: { aweme_list?: DouyinAweme[] }) => {
          if (Array.isArray(j?.aweme_list)) collect(j.aweme_list);
        })
        .catch(() => {
          /* non-JSON / consumed body — ignore, DOM fallback covers it */
        });
    });

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    } catch (e) {
      return {
        ok: false,
        code: 'NAV_FAILED',
        message: `Không mở được trang kênh Douyin: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    if (!headful && (await hasCaptchaWall(page))) {
      return {
        ok: false,
        code: 'CAPTCHA',
        message:
          'Douyin yêu cầu xác minh (captcha). Chạy "pnpm ent:douyin-login" để vượt 1 lần rồi tải lại.',
      };
    }

    // Scroll to trigger the post-list API until we have enough (or time out).
    const deadline = Date.now() + 20_000;
    while (seen.size < limit && Date.now() < deadline) {
      await page.mouse.wheel(0, 2400).catch(() => {});
      await page.waitForTimeout(1200);
    }

    // DOM fallback if the API capture yielded nothing (shape changed / blocked).
    if (seen.size === 0) {
      const ids = await page
        .$$eval('a[href*="/video/"]', (els) =>
          els
            .map((e) => (e as HTMLAnchorElement).getAttribute('href') ?? '')
            .map((h) => h.match(/\/video\/(\d+)/)?.[1] ?? '')
            .filter(Boolean),
        )
        .catch(() => [] as string[]);
      for (const id of ids) {
        if (!seen.has(id)) {
          seen.set(id, { url: `https://www.douyin.com/video/${id}`, videoId: id });
        }
      }
    }

    if (seen.size === 0) {
      // Last re-check: captcha may have appeared late and starved the feed.
      if (!headful && (await hasCaptchaWall(page))) {
        return {
          ok: false,
          code: 'CAPTCHA',
          message:
            'Douyin yêu cầu xác minh (captcha). Chạy "pnpm ent:douyin-login" để vượt 1 lần rồi tải lại.',
        };
      }
      return {
        ok: false,
        code: 'NO_VIDEOS',
        message: 'Không thấy video nào trên trang kênh (kênh trống hoặc trang đổi cấu trúc).',
      };
    }

    return { ok: true, videos: [...seen.values()].slice(0, limit) };
  } finally {
    await context.close().catch(() => {});
  }
}

/** TikTok(.com): yt-dlp flat-playlist — fast, structured, no browser needed. */
function listTikTokChannel(url: string, limit: number): ListResult {
  const r = spawnSync(
    'yt-dlp',
    [
      '--flat-playlist',
      '--dump-single-json',
      '--no-warnings',
      '--playlist-end',
      String(limit),
      url,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (r.status !== 0) {
    return { ok: false, code: 'LIST_FAILED', message: (r.stderr ?? '').slice(-300) };
  }
  try {
    const j = JSON.parse(r.stdout ?? '{}') as {
      uploader_id?: string;
      entries?: Array<{
        id?: string;
        url?: string;
        title?: string;
        duration?: number;
        thumbnails?: Array<{ url?: string }>;
      }>;
    };
    const videos: ChannelVideo[] = (j.entries ?? [])
      .slice(0, limit)
      .map((e) => {
        const id = e.id ?? null;
        const built =
          e.url || (id ? `https://www.tiktok.com/@${j.uploader_id ?? 'user'}/video/${id}` : '');
        return {
          url: built,
          videoId: id,
          title: e.title?.trim() || undefined,
          durationSec: typeof e.duration === 'number' ? Math.round(e.duration) : undefined,
          thumbnail: e.thumbnails?.[0]?.url,
        };
      })
      .filter((v) => v.url);
    if (videos.length === 0) {
      return { ok: false, code: 'NO_VIDEOS', message: 'Kênh nguồn TikTok không có video.' };
    }
    return { ok: true, videos };
  } catch (e) {
    return { ok: false, code: 'LIST_FAILED', message: e instanceof Error ? e.message : String(e) };
  }
}
