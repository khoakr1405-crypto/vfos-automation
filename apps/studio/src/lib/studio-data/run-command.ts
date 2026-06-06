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

import { type SpawnSyncReturns, spawn, spawnSync } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
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

/**
 * Khởi chạy một script TS NỀN (detached), trả về ngay không chờ kết thúc.
 * WHY: pipeline sản xuất video (script→voice→BGM→render→caption→QA) chạy vài phút,
 * vượt timeout 120s của runRepoScript và sẽ làm treo route handler. Detached + unref
 * cho process chạy độc lập; UI poll lại job state từ manifest sau đó.
 * stdio ghi vào 1 file log (runtime gitignored). shell:false + argv mảng ⇒ an toàn
 * injection như runRepoScript.
 * @param logAbsPath đường dẫn tuyệt đối file log (đã resolveInsideRepo ở route)
 */
export function runRepoScriptDetached(
  scriptRelPath: string,
  args: string[],
  logAbsPath: string,
): { pid: number | undefined } {
  const tsxCli = resolveInsideRepo(TSX_CLI_REL) ?? TSX_CLI_REL;
  const logFd = openSync(logAbsPath, 'a');
  try {
    const child = spawn(process.execPath, [tsxCli, scriptRelPath, ...args], {
      cwd: repoRoot(),
      env: { ...process.env },
      shell: false,
      detached: true,
      stdio: ['ignore', logFd, logFd],
    });
    const pid = child.pid;
    child.unref();
    return { pid };
  } finally {
    // child giữ bản sao fd của riêng nó; đóng fd phía parent để không leak handle.
    try {
      closeSync(logFd);
    } catch {}
  }
}
