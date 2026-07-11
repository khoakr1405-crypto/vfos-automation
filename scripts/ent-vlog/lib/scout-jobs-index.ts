// Trend Scout — read-only index aweme_id của các job Giải trí đang sống.
// ---------------------------------------------------------------------------
// WHY: scout cần gắn cờ `alreadyJobbed` để Operator khỏi lấy trùng video, nhưng
// scripts/ KHÔNG được import apps/studio (server-only, kéo @vfos/facebook).
// Replicate đúng tập con khoá MẠNH của findLivingJobBySourceKey: aweme_id từ
// `/video/<id>` hoặc share link đã có trong .source_id_cache.json (KHÔNG network
// — cờ này chỉ advisory; hard block vẫn là 409 guard lúc intake).
// Đọc manifest trực tiếp như tiktok-publish-run.ts / 13-source-bound.ts.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const JOB_DIR_RE = /^ent_[a-z0-9_]+$/;
const SHORT_LINK_RE = /^https?:\/\/v\.(?:douyin|iesdouyin)\.com\//i;

/** aweme_id từ URL canonical `/video/<id>` (cả share/video/<id>); không có → null. */
export function extractAwemeIdFromUrl(url: string): string | null {
  const m = (url ?? '').match(/\/video\/(\d+)/);
  return m?.[1] ?? null;
}

interface EntJobLite {
  state?: string;
  source?: { url?: string };
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Quét `<entDirAbs>/ent_<id>/ent_job.json` → tập aweme_id đã có job. Bỏ
 * INTAKE_FAILED (job lỗi không giữ khoá — video còn retry được, khớp semantics
 * dedup của studio). Share link chỉ resolve qua cache có sẵn — không mạng.
 * Không bao giờ throw: fs/JSON hỏng → bỏ qua entry đó.
 */
export function collectJobbedAwemeIds(entDirAbs: string): Set<string> {
  const out = new Set<string>();
  if (!existsSync(entDirAbs)) return out;

  const cacheRaw = readJson(join(entDirAbs, '.source_id_cache.json'));
  const cache =
    typeof cacheRaw === 'object' && cacheRaw !== null && !Array.isArray(cacheRaw)
      ? (cacheRaw as Record<string, unknown>)
      : {};

  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(entDirAbs, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !JOB_DIR_RE.test(entry.name)) continue;
    const job = readJson(join(entDirAbs, entry.name, 'ent_job.json')) as EntJobLite | null;
    if (!job || job.state === 'INTAKE_FAILED') continue;
    const url = job.source?.url;
    if (typeof url !== 'string' || url === '') continue;
    const direct = extractAwemeIdFromUrl(url);
    if (direct) {
      out.add(direct);
      continue;
    }
    if (SHORT_LINK_RE.test(url)) {
      const cached = cache[url];
      if (typeof cached === 'string' && /^\d+$/.test(cached)) out.add(cached);
    }
  }
  return out;
}
