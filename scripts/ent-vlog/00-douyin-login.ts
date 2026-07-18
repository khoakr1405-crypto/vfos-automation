import { mkdirSync } from 'node:fs';
// E1 step 00 (one-time setup) — open Douyin in the PERSISTENT fetch profile so
// the operator can clear any captcha / optionally log in. Cookies + trust are
// saved to data/secure/douyin_profile (gitignored); afterwards 01-fetch-source
// captures the video streams headless and unattended.
//
//   pnpm ent:douyin-login            # opens douyin.com, close window when done
//   pnpm ent:douyin-login --url <video-url>
//
// NO download, NO publish, NO secrets logged.
import { parseArgs } from 'node:util';
import { douyinProfileDir, douyinUserAgent } from './lib/douyin-fetch.js';
import { writeDouyinLoginStatus } from './lib/douyin-login-status.js';
import { findWorkspaceRoot } from './lib/env.js';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { url: { type: 'string' } },
    strict: true,
  });
  const startUrl = values.url || 'https://www.douyin.com/';

  const { chromium } = await import('playwright');
  const profileDir = douyinProfileDir();
  mkdirSync(profileDir, { recursive: true });

  console.log('------------------------------------------------------');
  console.log('[00] Mở Douyin để thiết lập profile tải nguồn (1 lần).');
  console.log('     Việc cần làm trong cửa sổ vừa mở:');
  console.log('       1. Nếu hiện captcha/xác minh → kéo/giải cho qua.');
  console.log('       2. (Tùy chọn) Đăng nhập Douyin để cookie bền hơn.');
  console.log('       3. Mở thử 1 video bất kỳ cho chạy vài giây.');
  console.log('       4. ĐÓNG cửa sổ trình duyệt → profile được lưu, xong.');
  console.log(`     Profile: ${profileDir.replace(/\\/g, '/')}`);
  console.log('------------------------------------------------------');

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    userAgent: douyinUserAgent(),
    args: ['--disable-blink-features=AutomationControlled'],
  });

  // Ghi status OPEN để route/UI biết cửa sổ đang mở (poll auto-resume).
  const root = findWorkspaceRoot(process.cwd());
  const openedAt = new Date().toISOString();
  writeDouyinLoginStatus(root, {
    state: 'OPEN',
    openedAt,
    closedAt: null,
    pid: process.pid,
    generatedAt: openedAt,
  });

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {
    console.log('⚠ Trang load chậm — cứ thao tác bình thường rồi đóng khi xong.');
  });

  // Chờ operator đóng cửa sổ → persistent context tự lưu cookie rồi kết thúc.
  await new Promise<void>((resolve) => {
    context.on('close', () => resolve());
  });

  // Ghi status CLOSED (login xong) → UI poll thấy sẽ tự tải lại job lỗi.
  const closedAt = new Date().toISOString();
  writeDouyinLoginStatus(root, {
    state: 'CLOSED',
    openedAt,
    closedAt,
    pid: process.pid,
    generatedAt: closedAt,
  });

  console.log('[00] ✅ Đã lưu profile Douyin. Giờ bấm "Tải link" lại trên Studio.');
}

main().catch((e) => {
  console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
