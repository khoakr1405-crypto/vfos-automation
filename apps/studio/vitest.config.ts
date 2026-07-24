/* =============================================================================
 * VFOS Studio — vitest config (round test-infra, Phần 83)
 * -----------------------------------------------------------------------------
 * Lý do tồn tại: apps/studio KHÔNG có "type":"module" → tsx --test coi biên
 * studio là CJS, named-ESM-import bị nuốt → 7 test chết (5 entertainment +
 * 2 nhánh fail-closed cổng đăng thật). Vitest transform TS + resolve alias '@/'
 * + interop CJS/ESM native → hồi sinh toàn bộ mà KHÔNG đổi production code.
 * Chạy: pnpm --filter @vfos/studio test  (= vitest run)
 * ========================================================================== */

import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// biome-ignore lint/style/noDefaultExport: vitest config bắt buộc default export
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Test đụng env/global fetch stub → chạy tuần tự trong file (mặc định), KHÔNG
    // song song giữa test cùng file để stub không dẫm nhau.
    fileParallelism: true,
  },
});
