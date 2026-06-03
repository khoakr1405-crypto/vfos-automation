/* =============================================================================
 * VFOS Studio — Growth OS path helpers (Round Growth 02)
 * -----------------------------------------------------------------------------
 * SERVER ONLY. Dùng node:path. KHÔNG import vào client component.
 * Reuse repoRoot()/resolveInsideRepo() từ studio-data/paths (single source of
 * truth, anti path-traversal).
 *
 * Mock fixtures (commit được) nằm trong cây source: apps/studio/src/lib/
 * growth-data/fixtures. Dữ liệu vận hành thật (data/growth/, gitignored) là việc
 * của round sau — Growth 02 chỉ đọc fixtures.
 * ========================================================================== */

import { join } from 'node:path';
import { repoRoot, resolveInsideRepo } from '../studio-data/paths';

export { repoRoot, resolveInsideRepo };

const GROWTH_FIXTURES_REL = join('apps', 'studio', 'src', 'lib', 'growth-data', 'fixtures');

/** Absolute path tới thư mục mock fixtures (đã chặn traversal). null nếu lỗi. */
export function growthFixturesDir(): string | null {
  return resolveInsideRepo(GROWTH_FIXTURES_REL);
}
