/* =============================================================================
 * VFOS Studio — server-side path helpers (Round UI-02)
 * -----------------------------------------------------------------------------
 * SERVER ONLY. Dùng node:fs/path — chỉ được import từ route handlers dưới
 * app/api/studio/*. KHÔNG import vào client component.
 *
 * Studio chạy với cwd = <repo>/apps/studio (pnpm --filter). Dữ liệu job thật
 * nằm ở repo root (data/temp/*, runs/*). repoRoot() leo lên tìm marker workspace
 * để định vị root một cách bền vững, không hardcode '../..'.
 * ========================================================================== */

import { existsSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

let cachedRoot: string | null = null;

/** Climb up from cwd to the pnpm workspace root (marker: pnpm-lock.yaml). */
export function repoRoot(): string {
  if (cachedRoot) return cachedRoot;
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'pnpm-lock.yaml')) || existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      cachedRoot = dir;
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  cachedRoot = process.cwd();
  return cachedRoot;
}

/**
 * Resolve a repo-relative path to an absolute path, guaranteeing the result
 * stays INSIDE the repo root (anti path-traversal). Returns null if the path
 * escapes the root. Never throws.
 */
export function resolveInsideRepo(relOrAbs: string): string | null {
  try {
    const root = resolve(repoRoot());
    const abs = resolve(root, relOrAbs);
    if (abs !== root && !abs.startsWith(root + sep)) return null;
    return abs;
  } catch {
    return null;
  }
}
