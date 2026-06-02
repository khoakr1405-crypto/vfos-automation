/* =============================================================================
 * VFOS Studio — safe repo-script runner (SERVER ONLY)
 * -----------------------------------------------------------------------------
 * WHY: spawn `pnpm.cmd` (một .cmd batch) với { shell: false } ném EINVAL trên
 * Node >= 20.12 / 22 / 24 (siết bảo mật CVE-2024-27980) → status `null`, command
 * không bao giờ chạy. Còn { shell: true } sẽ nối chuỗi args không escape → rủi ro
 * shell injection qua free-text (vd: notes của reject).
 *
 * Giải pháp: chạy thẳng `node <tsx-cli> <script.ts> <args...>` với { shell: false }.
 * Argv truyền dạng mảng (không qua shell) ⇒ vừa tránh EINVAL vừa an toàn injection.
 * Đây đúng cách `pnpm <script>` gọi tới (package.json map `tsx scripts/...`).
 * ========================================================================== */

import { type SpawnSyncReturns, spawnSync } from 'node:child_process';
import { repoRoot, resolveInsideRepo } from './paths';

const TSX_CLI_REL = 'node_modules/tsx/dist/cli.mjs';

/**
 * Chạy một script TS trong repo qua tsx, an toàn cross-platform.
 * @param scriptRelPath đường dẫn script tương đối repo root (vd scripts/vfos-job-manager.ts)
 * @param args argv truyền cho script (đã validate ở route; KHÔNG qua shell)
 */
export function runRepoScript(scriptRelPath: string, args: string[]): SpawnSyncReturns<string> {
  const tsxCli = resolveInsideRepo(TSX_CLI_REL) ?? TSX_CLI_REL;
  return spawnSync(process.execPath, [tsxCli, scriptRelPath, ...args], {
    cwd: repoRoot(),
    encoding: 'utf8',
    env: { ...process.env },
    shell: false,
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
  });
}
