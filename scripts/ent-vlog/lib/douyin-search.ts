// Trend Scout — Douyin keyword-search capture (browser layer, mỏng).
// ---------------------------------------------------------------------------
// WHY: mirror đúng douyin-channel.ts — driver browser thật với profile persistent
// (trust tích lũy), bắt JSON search API từ network (số liệu chuẩn, không scrape
// DOM "1.2万"), scroll để nạp thêm, DOM fallback chỉ lấy id, CAPTCHA gate y hệt.
// Khác channel-lister 1 điểm: 1 context/run + 1 goto/keyword (mở context mỗi
// keyword vừa chậm vừa "botty"). Tuần tự, KHÔNG parallelism.
//
// LƯU Ý VẬN HÀNH: dùng chung data/secure/douyin_profile với fetcher/channel-lister
// — chạy 1 công cụ Douyin tại một thời điểm (UI đã guard, CLI thì Operator tự nhớ).
//
// URL params `sort_type=2` (mới nhất) + `publish_time=1` (trong 1 ngày) là HINT
// chưa verify trên Douyin thật — sai cũng KHÔNG hỏng kết quả vì scout-core lọc
// tuổi client-side từ create_time; sai chỉ giảm yield (smoke headful sẽ verify).
import { mkdirSync } from 'node:fs';
import type { BrowserContext, Page } from 'playwright';
import { douyinProfileDir, douyinUserAgent, hasCaptchaWall } from './douyin-fetch.js';
import { type RawSearchItem, parseSearchResponse } from './scout-core.js';

const DOUYIN_SEARCH_API = /aweme\/v1\/web\/(?:general\/)?search\/(?:single|item)/i;
const CAPTCHA_MSG =
  'Douyin yêu cầu xác minh (captcha). Chạy "pnpm ent:douyin-login" để vượt 1 lần rồi quét lại.';

export interface ScoutSession {
  context: BrowserContext;
  page: Page;
}

export async function openScoutSession(headful: boolean): Promise<ScoutSession> {
  const { chromium } = await import('playwright');
  const profileDir = douyinProfileDir();
  mkdirSync(profileDir, { recursive: true });
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: !headful,
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    userAgent: douyinUserAgent(),
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

export async function closeScoutSession(session: ScoutSession): Promise<void> {
  await session.context.close().catch(() => {});
}

export type SearchKeywordResult =
  | { ok: true; items: RawSearchItem[]; domOnlyIds: string[] }
  | { ok: false; code: 'CAPTCHA' | 'NAV_FAILED' | 'NO_RESULTS'; message: string };

/**
 * Search 1 keyword: goto trang search (hint sort=mới nhất) → bắt JSON qua network
 * → scroll tới khi đủ targetCount item hoặc hết scrollBudgetMs → DOM fallback id.
 * `onRawBody` (tùy chọn) nhận body thô để --dump-raw gặt fixture.
 */
export async function searchDouyinKeyword(
  session: ScoutSession,
  keyword: string,
  opts: {
    targetCount: number;
    scrollBudgetMs: number;
    headful?: boolean;
    onRawBody?: (body: unknown) => void;
  },
): Promise<SearchKeywordResult> {
  const { page } = session;
  const byId = new Map<string, RawSearchItem>();

  const onResponse = (r: import('playwright').Response): void => {
    if (!DOUYIN_SEARCH_API.test(r.url())) return;
    void r
      .json()
      .then((body: unknown) => {
        opts.onRawBody?.(body);
        for (const item of parseSearchResponse(body)) {
          if (!byId.has(item.awemeId)) byId.set(item.awemeId, item);
        }
      })
      .catch(() => {
        /* non-JSON / body consumed — DOM fallback bù id */
      });
  };
  page.on('response', onResponse);

  try {
    const url = `https://www.douyin.com/search/${encodeURIComponent(keyword)}?type=video&sort_type=2&publish_time=1`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    } catch (e) {
      return {
        ok: false,
        code: 'NAV_FAILED',
        message: `Không mở được trang search Douyin: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    if (!opts.headful && (await hasCaptchaWall(page))) {
      return { ok: false, code: 'CAPTCHA', message: CAPTCHA_MSG };
    }

    // Scroll để trigger thêm trang search API (pattern listDouyinChannel).
    const deadline = Date.now() + opts.scrollBudgetMs;
    while (byId.size < opts.targetCount && Date.now() < deadline) {
      await page.mouse.wheel(0, 2400).catch(() => {});
      await page.waitForTimeout(1200);
    }

    // DOM fallback: chỉ id (không số liệu) — hiển thị cho biết, không xếp hạng.
    const domOnlyIds: string[] = [];
    if (byId.size === 0) {
      const ids = await page
        .$$eval('a[href*="/video/"]', (els) =>
          els
            .map(
              (e) =>
                (e as { getAttribute(name: string): string | null }).getAttribute('href') ?? '',
            )
            .map((h) => h.match(/\/video\/(\d+)/)?.[1] ?? '')
            .filter(Boolean),
        )
        .catch(() => [] as string[]);
      for (const id of ids) {
        if (!domOnlyIds.includes(id)) domOnlyIds.push(id);
      }
    }

    if (byId.size === 0 && domOnlyIds.length === 0) {
      // CAPTCHA có thể hiện muộn làm feed đói — re-check trước khi kết luận.
      if (!opts.headful && (await hasCaptchaWall(page))) {
        return { ok: false, code: 'CAPTCHA', message: CAPTCHA_MSG };
      }
      return {
        ok: false,
        code: 'NO_RESULTS',
        message: `Search "${keyword}" không trả kết quả nào (keyword hiếm hoặc trang đổi cấu trúc).`,
      };
    }

    return { ok: true, items: [...byId.values()], domOnlyIds };
  } finally {
    page.off('response', onResponse);
  }
}
