import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

// VFOS Studio — nạp .env Ở GỐC monorepo cho server (token TikTok/Facebook).
// `next dev` chạy với cwd = apps/studio và KHÔNG tự nạp .env gốc. next.config
// chạy ở Node (KHÔNG qua webpack) nên đọc fs an toàn — tránh lỗi "node:fs"
// (UnhandledScheme) khi làm việc này trong instrumentation.ts (bị bundle edge).
// ADDITIVE: KHÔNG ghi đè biến đã set (shell/CI ưu tiên), bỏ comment, KHÔNG in giá trị.
function loadRootEnv(): void {
  try {
    const envPath = resolve(process.cwd(), '../../.env');
    if (!existsSync(envPath)) return;
    for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = rawLine.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue; // bỏ comment (#...) và dòng rỗng
      const key = m[1];
      if (process.env[key] !== undefined) continue; // KHÔNG ghi đè biến đã có
      let val = (m[2] ?? '').trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch {
    /* .env vắng/định dạng lạ — bỏ qua; route tự báo NOT_CONFIGURED */
  }
}

loadRootEnv();

// VFOS Studio — multi-channel content coordination UI shell.
// Round UI-01: front-end shell only. No backend rewrites, no real API calls.
const config: NextConfig = {
  transpilePackages: ['@vfos/facebook'],
  experimental: {
    webpackMemoryOptimizations: true,
    cpus: 2,
    preloadEntriesOnStart: false,
  },
  webpack: (config, { dev }) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    if (dev) config.parallelism = 2;
    return config;
  },
};

// biome-ignore lint/style/noDefaultExport: Next.js config requires default export
export default config;
