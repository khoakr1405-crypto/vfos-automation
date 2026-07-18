// Durable Douyin source fetcher for the entertainment lane.
// ---------------------------------------------------------------------------
// WHY: yt-dlp's Douyin extractor is broken by Douyin's anti-bot ("Fresh cookies
// are needed") and static cookie exports go stale in minutes. Instead we drive a
// REAL browser (Playwright) with a PERSISTENT profile: load the video page, let
// the web player buffer its DASH streams, capture the actual signed CDN URLs from
// network traffic, download them THROUGH the browser context (cookies/UA/signing
// all match), then mux video+audio with ffmpeg. No extractor, no cookie staleness.
//
// The persistent profile lives under data/secure/ (gitignored) and accumulates
// trust across runs. First-time / captcha → operator runs the headful setup once
// (00-douyin-login.ts); afterwards headless fetching works unattended.
//
// NO API key, NO secrets logged. Cookie VALUES never printed; only stream byte
// sizes and codes.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findWorkspaceRoot } from './env.js';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
const DOUYIN_RE = /douyin\.com|iesdouyin/i;
const REFERER = 'https://www.douyin.com/';

/** Persistent Chromium profile dedicated to Douyin source-fetching (gitignored). */
export function douyinProfileDir(): string {
  return join(findWorkspaceRoot(process.cwd()), 'data', 'secure', 'douyin_profile');
}

/** Desktop UA used for the browser context (kept stable across runs). */
export function douyinUserAgent(): string {
  return DESKTOP_UA;
}

export function isDouyinUrl(url: string): boolean {
  return DOUYIN_RE.test(url);
}

/** Heuristic captcha/verify wall detection (slider / "请完成验证"). A login modal
 * alone is NOT blocking (videos stay viewable), so we only flag a real challenge.
 * Exported so the channel-lister reuses the exact same detection. */
export async function hasCaptchaWall(page: import('playwright').Page): Promise<boolean> {
  const selectors = [
    '.captcha_verify_container',
    '#captcha-verify-image',
    '.captcha-verify-container',
    'iframe[src*="captcha"]',
  ];
  for (const sel of selectors) {
    if (
      (await page
        .locator(sel)
        .count()
        .catch(() => 0)) > 0
    )
      return true;
  }
  const body =
    (await page
      .locator('body')
      .innerText({ timeout: 2000 })
      .catch(() => '')) || '';
  return /请完成验证|滑动验证|完成下方拼图|slide to verify/i.test(body);
}

/** Best-effort detection của LOGIN/SECURITY GATE Douyin — nghĩa là cookie phiên
 * đã CHẾT / mất tin cậy (khác captcha slider, khác login modal có-thể-tắt vốn
 * KHÔNG chặn xem). CHỈ dùng tín hiệu URL redirect (passport/login/security) —
 * modal tắt-được không đổi URL nên không bị dương tính giả. Nếu không khớp →
 * caller rơi về NO_STREAM như cũ (không regression). Heuristic; nên hiệu chuẩn
 * lại với 1 phiên chết thật. Export để channel-lister/search dùng chung. */
const LOGIN_WALL_RE =
  /passport\.douyin|\/passport\/|security[-_]?check|\/user\/login|[?&]need_?login/i;
export function isLoginWallUrl(url: string): boolean {
  return LOGIN_WALL_RE.test(url);
}

export type FetchResult =
  | { ok: true; outPath: string; bytes: number; hasAudio: boolean }
  | {
      ok: false;
      code:
        | 'CAPTCHA'
        | 'SESSION_EXPIRED'
        | 'NO_STREAM'
        | 'NAV_FAILED'
        | 'DOWNLOAD_FAILED'
        | 'MUX_FAILED';
      message: string;
    };

const SESSION_EXPIRED_MSG =
  'Phiên Douyin hết hạn / cần đăng nhập lại (session expired). Đăng nhập lại Douyin rồi tải lại.';

/**
 * Fetch a Douyin video to `outPath` (a real .mp4 with audio) by capturing its
 * DASH streams in a real browser session and muxing them.
 * @param headful  show the window (debug/manual); default headless.
 * @param settleMs max time to wait for the player to begin buffering (ms).
 */
export async function fetchDouyinSource(opts: {
  url: string;
  outPath: string;
  workDir: string;
  headful?: boolean;
  settleMs?: number;
}): Promise<FetchResult> {
  const { chromium } = await import('playwright');
  const profileDir = douyinProfileDir();
  mkdirSync(profileDir, { recursive: true });
  mkdirSync(opts.workDir, { recursive: true });

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: !opts.headful,
    viewport: { width: 1280, height: 800 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    userAgent: DESKTOP_UA,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const tmpVideo = join(opts.workDir, '.dy_video.mp4');
  const tmpAudio = join(opts.workDir, '.dy_audio.mp4');

  try {
    const page = context.pages()[0] ?? (await context.newPage());

    // Capture the first video + audio DASH stream URLs the player requests.
    let videoUrl: string | null = null;
    let audioUrl: string | null = null;
    page.on('response', (r) => {
      const u = r.url();
      if (!videoUrl && /media-video-avc1|media-video-hvc1/i.test(u)) videoUrl = u;
      if (!audioUrl && /media-audio-und-mp4a|media-audio/i.test(u)) audioUrl = u;
    });

    try {
      await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    } catch (e) {
      return {
        ok: false,
        code: 'NAV_FAILED',
        message: `Không mở được trang Douyin: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    // Captcha wall → operator must clear it once (headful setup).
    if (!opts.headful && (await hasCaptchaWall(page))) {
      return {
        ok: false,
        code: 'CAPTCHA',
        message:
          'Douyin yêu cầu xác minh (captcha). Chạy "pnpm ent:douyin-login" để vượt 1 lần rồi tải lại.',
      };
    }

    // Login/security gate ngay khi mở: chỉ tin redirect TRANG TOP-LEVEL sang
    // passport/login (page.url()) — tín hiệu chắc chắn, không dương tính giả.
    // (KHÔNG dựa 401/403 subresource: Douyin fire nhiều API 401/403 cả khi phiên
    // KHỎE → sẽ báo nhầm.) Session chết không redirect → rơi về NO_STREAM (fail-safe).
    if (isLoginWallUrl(page.url())) {
      return { ok: false, code: 'SESSION_EXPIRED', message: SESSION_EXPIRED_MSG };
    }

    // Wait for the player to start buffering its DASH streams.
    const deadline = Date.now() + (opts.settleMs ?? 25_000);
    while ((!videoUrl || !audioUrl) && Date.now() < deadline) {
      await page.waitForTimeout(1000);
    }
    if (!videoUrl) {
      // Re-check captcha in case it appeared late and starved the player.
      if (!opts.headful && (await hasCaptchaWall(page))) {
        return {
          ok: false,
          code: 'CAPTCHA',
          message:
            'Douyin yêu cầu xác minh (captcha). Chạy "pnpm ent:douyin-login" để vượt 1 lần rồi tải lại.',
        };
      }
      // Player không buffer + trang đã redirect login-wall → phiên chết (KHÁC post
      // ảnh/slideshow, vốn ở nguyên URL video → vẫn NO_STREAM, không vu oan).
      if (isLoginWallUrl(page.url())) {
        return { ok: false, code: 'SESSION_EXPIRED', message: SESSION_EXPIRED_MSG };
      }
      return {
        ok: false,
        code: 'NO_STREAM',
        message:
          'Không bắt được luồng video (có thể là post ảnh/slideshow, hoặc trang đổi cấu trúc).',
      };
    }

    // Download through the browser context so cookies/UA/signature all match.
    const download = async (u: string, out: string): Promise<number> => {
      const resp = await context.request.get(u, {
        headers: { referer: REFERER },
        timeout: 120_000,
      });
      if (resp.status() !== 200) {
        throw new Error(`HTTP ${resp.status()} khi tải stream`);
      }
      const body = await resp.body();
      writeFileSync(out, body);
      return body.length;
    };

    let vBytes = 0;
    let aBytes = 0;
    try {
      vBytes = await download(videoUrl, tmpVideo);
      if (audioUrl) aBytes = await download(audioUrl, tmpAudio);
    } catch (e) {
      return {
        ok: false,
        code: 'DOWNLOAD_FAILED',
        message: e instanceof Error ? e.message : String(e),
      };
    }
    if (vBytes === 0) {
      return { ok: false, code: 'DOWNLOAD_FAILED', message: 'Stream video rỗng.' };
    }

    // Mux video+audio (or copy video-only) into the final source mp4.
    const hasAudio = aBytes > 0 && existsSync(tmpAudio);
    const args = hasAudio
      ? [
          '-y',
          '-i',
          tmpVideo,
          '-i',
          tmpAudio,
          '-c',
          'copy',
          '-movflags',
          '+faststart',
          opts.outPath,
        ]
      : ['-y', '-i', tmpVideo, '-c', 'copy', '-movflags', '+faststart', opts.outPath];
    const mux = spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (mux.status !== 0 || !existsSync(opts.outPath)) {
      return {
        ok: false,
        code: 'MUX_FAILED',
        message: `ffmpeg mux thất bại (exit ${mux.status}). ${(mux.stderr ?? '').slice(-300)}`,
      };
    }

    return { ok: true, outPath: opts.outPath, bytes: vBytes + aBytes, hasAudio };
  } finally {
    await context.close().catch(() => {});
    for (const f of [tmpVideo, tmpAudio]) {
      try {
        rmSync(f, { force: true });
      } catch {
        /* temp cleanup best-effort */
      }
    }
  }
}
