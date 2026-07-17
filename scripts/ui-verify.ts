/**
 * VFOS UI Verify — kiểm tra tự động Studio UI trước khi mời Operator duyệt mắt.
 *
 * Pattern lấy từ anthropics/skills `webapp-testing` (with_server + reconnaissance):
 *   1. Probe dev server :3002 — nếu chưa chạy thì tự khởi động, xong tự tắt.
 *   2. Mở từng route bằng Playwright (Chrome hệ thống, headless — KHÔNG đụng
 *      profile Cốc Cốc dành riêng cho Shopee CDP).
 *   3. Check: HTTP status, pageerror JS, Next.js error overlay, body có render.
 *   4. Chụp screenshot full-page + xuất report.json vào data/ui-verify/ (gitignored).
 *
 * Đây là bước TIỀN KIỂM kỹ thuật — KHÔNG thay thế Operator visual approval
 * (vfos-ui-review-skill §1: "No Operator visual approval, no UI commit").
 *
 * Usage:
 *   pnpm ui:verify
 *   pnpm ui:verify -- --routes /,/lanes/product-review
 *   pnpm ui:verify -- --keep-server   (giữ dev server chạy sau khi verify)
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = 'http://127.0.0.1:3002';

const DEFAULT_ROUTES = ['/', '/lanes/product-review', '/lanes/content', '/analytics'] as const;

interface RouteResult {
  route: string;
  url: string;
  verdict: 'PASS' | 'FAIL';
  httpStatus: number | null;
  pageErrors: string[];
  consoleErrors: string[];
  nextOverlayError: string | null;
  bodyTextLength: number;
  headings: string[];
  screenshot: string;
  failReasons: string[];
}

function parseArgs(argv: string[]): { routes: string[]; keepServer: boolean } {
  const routesIdx = argv.indexOf('--routes');
  const routes =
    routesIdx >= 0 && argv[routesIdx + 1]
      ? argv[routesIdx + 1].split(',').map((r) => (r.startsWith('/') ? r : `/${r}`))
      : [...DEFAULT_ROUTES];
  return { routes, keepServer: argv.includes('--keep-server') };
}

async function isServerUp(): Promise<boolean> {
  try {
    await fetch(BASE_URL, { signal: AbortSignal.timeout(3000) });
    return true;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isServerUp()) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

function startDevServer(): ChildProcess {
  console.log('[ui-verify] Dev server chưa chạy — khởi động `pnpm --filter @vfos/studio dev`...');
  return spawn('pnpm --filter @vfos/studio dev', {
    shell: true,
    stdio: 'ignore',
    detached: false,
  });
}

function killProcessTree(child: ChildProcess): void {
  if (child.pid === undefined) return;
  spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
}

async function verifyRoute(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  route: string,
  outDir: string,
): Promise<RouteResult> {
  const url = `${BASE_URL}${route}`;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const slug = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '_');
  const screenshot = path.join(outDir, `${slug}.png`);
  let httpStatus: number | null = null;
  let nextOverlayError: string | null = null;
  let bodyTextLength = 0;
  let headings: string[] = [];
  const failReasons: string[] = [];

  try {
    const response = await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    httpStatus = response?.status() ?? null;
    // webapp-testing: "CRITICAL: Wait for JS to execute" trước khi đọc DOM
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(1000);

    // nextjs-portal luôn tồn tại ở dev mode (dev-tools badge) và textContent
    // của shadow root kéo cả <style> — nên chỉ tin 2 tín hiệu lỗi thật:
    // badge gắn data-error='true', hoặc dialog lỗi có innerText (innerText
    // không chứa CSS như textContent).
    nextOverlayError = await page.evaluate(() => {
      const root = document.querySelector('nextjs-portal')?.shadowRoot;
      if (!root) return null;
      const badgeError = root.querySelector("[data-next-badge][data-error='true']") !== null;
      const dialog = root.querySelector<HTMLElement>(
        '[data-nextjs-dialog], [data-nextjs-error-overlay], #nextjs__container_errors_label',
      );
      const dialogText = dialog?.innerText.trim() ?? '';
      if (dialogText.length > 0) return dialogText.slice(0, 500);
      return badgeError ? 'Next dev badge báo lỗi (data-error=true)' : null;
    });
    bodyTextLength = await page.evaluate(() => document.body?.innerText.trim().length ?? 0);
    headings = await page.evaluate(() =>
      Array.from(document.querySelectorAll('h1, h2'))
        .map((h) => h.textContent?.trim() ?? '')
        .filter((t) => t.length > 0)
        .slice(0, 8),
    );
    await page.screenshot({ path: screenshot, fullPage: true });
  } catch (err) {
    failReasons.push(
      `Điều hướng/đọc trang lỗi: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    await page.close();
  }

  if (httpStatus === null || httpStatus >= 400)
    failReasons.push(`HTTP status ${httpStatus ?? 'N/A'}`);
  if (pageErrors.length > 0) failReasons.push(`${pageErrors.length} JS pageerror`);
  if (nextOverlayError !== null) failReasons.push('Next.js error overlay xuất hiện');
  if (bodyTextLength < 50) failReasons.push(`Body gần như trống (${bodyTextLength} ký tự)`);

  return {
    route,
    url,
    verdict: failReasons.length === 0 ? 'PASS' : 'FAIL',
    httpStatus,
    pageErrors,
    consoleErrors,
    nextOverlayError,
    bodyTextLength,
    headings,
    screenshot,
    failReasons,
  };
}

async function main(): Promise<void> {
  const { routes, keepServer } = parseArgs(process.argv.slice(2));

  const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(process.cwd(), 'data', 'ui-verify', runId);
  mkdirSync(outDir, { recursive: true });

  let devServer: ChildProcess | null = null;
  const alreadyUp = await isServerUp();
  if (alreadyUp) {
    console.log(`[ui-verify] Dev server đã chạy sẵn ở ${BASE_URL} — dùng lại, sẽ KHÔNG tắt.`);
  } else {
    devServer = startDevServer();
    const up = await waitForServer(120000);
    if (!up) {
      killProcessTree(devServer);
      console.error('[ui-verify] FAIL: dev server không lên được trong 120s.');
      process.exit(1);
    }
    console.log(`[ui-verify] Dev server sẵn sàng ở ${BASE_URL}.`);
  }

  let browser: Awaited<ReturnType<typeof chromium.launch>>;
  try {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
  } catch {
    console.log(
      '[ui-verify] Không tìm thấy Chrome hệ thống — thử Chromium bundled của Playwright.',
    );
    browser = await chromium.launch({ headless: true });
  }

  const results: RouteResult[] = [];
  try {
    for (const route of routes) {
      console.log(`[ui-verify] Đang kiểm tra ${route} ...`);
      results.push(await verifyRoute(browser, route, outDir));
    }
  } finally {
    await browser.close();
    if (devServer !== null && !keepServer) {
      killProcessTree(devServer);
      console.log('[ui-verify] Đã tắt dev server do script khởi động.');
    } else if (devServer !== null) {
      console.log(`[ui-verify] --keep-server: dev server vẫn chạy ở ${BASE_URL}.`);
    }
  }

  const reportPath = path.join(outDir, 'report.json');
  writeFileSync(reportPath, JSON.stringify({ runId, baseUrl: BASE_URL, results }, null, 2));

  console.log('');
  console.log('=== UI VERIFY REPORT ===');
  for (const r of results) {
    const consoleNote =
      r.consoleErrors.length > 0 ? ` (WARN: ${r.consoleErrors.length} console.error)` : '';
    console.log(`  ${r.verdict === 'PASS' ? '✅ PASS' : '❌ FAIL'}  ${r.route}${consoleNote}`);
    for (const reason of r.failReasons) console.log(`      → ${reason}`);
    if (r.headings.length > 0) console.log(`      headings: ${r.headings.join(' | ')}`);
  }
  console.log(`  Screenshots + report: ${outDir}`);
  console.log(
    '  ⚠️ Đây là tiền kiểm kỹ thuật — Operator vẫn phải duyệt UI bằng mắt trước khi commit.',
  );

  const failed = results.filter((r) => r.verdict === 'FAIL');
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[ui-verify] Lỗi không mong đợi:', err);
  process.exit(1);
});
