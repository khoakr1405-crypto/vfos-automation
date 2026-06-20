/* =============================================================================
 * VFOS Studio — Entertainment lane job store (E-UI-2) — SERVER ONLY
 * -----------------------------------------------------------------------------
 * Manifest IO + intake orchestration cho lane Giải trí/Vlog Câu cá. Tách HẲN
 * khỏi Product Review: ghi vào namespace runtime riêng data/temp/ent/<id>/,
 * KHÔNG đụng Product Card / Shopee / publish / review registry.
 * Manifest schema theo docs/00_DIEU_HANH/VFOS_ENTERTAINMENT_LANE_SPEC.md (§4).
 * Chỉ import từ route handlers dưới app/api/studio/entertainment/*.
 * ========================================================================== */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveInsideRepo } from '@/lib/studio-data/paths';
import { runRepoScript } from '@/lib/studio-data/run-command';

const ENT_DIR_REL = 'data/temp/ent';
const FETCH_SCRIPT_REL = 'scripts/ent-vlog/01-fetch-source.ts';
const FETCH_TIMEOUT_MS = 240_000; // download có thể vài chục giây
const NICHES = new Set(['fishing-vlog', 'car-vlog']);

export type EntJobState = 'INTAKE_RUNNING' | 'INTAKE_DONE' | 'INTAKE_FAILED';

export interface EntSource {
  url: string;
  type: 'douyin' | 'tiktok' | 'url' | 'local';
  path?: string;
  durationSec?: number;
  width?: number | null;
  height?: number | null;
  fps?: number;
  hasAudio?: boolean;
}

export interface EntJob {
  jobId: string;
  lane: 'entertainment/fishing-vlog';
  niche: string;
  state: EntJobState;
  createdAt: string;
  updatedAt: string;
  source: EntSource;
  error?: { code: string; message: string } | null;
}

export function isValidNiche(niche: string): boolean {
  return NICHES.has(niche);
}

/** jobId chỉ chứa [a-z0-9_], luôn prefix ent_ — chống path traversal khi đọc. */
export function isValidJobId(id: string): boolean {
  return /^ent_[a-z0-9_]+$/.test(id);
}

function detectType(url: string): EntSource['type'] {
  if (/douyin\.com|iesdouyin/i.test(url)) return 'douyin';
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  return 'url';
}

function nowIso(): string {
  return new Date().toISOString();
}

function genJobId(niche: string): string {
  const short = niche.replace(/-vlog$/, '').replace(/[^a-z0-9]/g, '') || 'ent';
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `ent_${short}_${ts}`;
}

function manifestPath(id: string): string | null {
  if (!isValidJobId(id)) return null;
  return resolveInsideRepo(`${ENT_DIR_REL}/${id}/ent_job.json`);
}

/** Bỏ absolute repo path khỏi message lỗi trước khi trả ra UI. */
function sanitizeError(raw: string): string {
  const root = resolveInsideRepo('.') ?? '';
  return raw
    .replaceAll(root, '')
    .replaceAll('\\', '/')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(-280);
}

export function readManifest(id: string): EntJob | null {
  const p = manifestPath(id);
  if (!p || !existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as EntJob;
  } catch {
    return null;
  }
}

function writeManifest(id: string, job: EntJob): void {
  const p = manifestPath(id);
  if (!p) throw new Error('INVALID_JOB_ID');
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, JSON.stringify(job, null, 2));
}

export function listJobs(): EntJob[] {
  const base = resolveInsideRepo(ENT_DIR_REL);
  if (!base || !existsSync(base)) return [];
  const jobs: EntJob[] = [];
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isValidJobId(entry.name)) continue;
    const m = readManifest(entry.name);
    if (m) jobs.push(m);
  }
  return jobs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/**
 * Tạo job giải trí + chạy intake (01-fetch-source) đồng bộ. Ghi manifest
 * INTAKE_RUNNING trước, rồi cập nhật INTAKE_DONE/FAILED sau khi tải xong.
 * KHÔNG ghi bất kỳ registry nào của Product Review/Shopee.
 */
export function createJob(input: { url: string; niche: string }): EntJob {
  const id = genJobId(input.niche);
  const now = nowIso();
  let job: EntJob = {
    jobId: id,
    lane: 'entertainment/fishing-vlog',
    niche: input.niche,
    state: 'INTAKE_RUNNING',
    createdAt: now,
    updatedAt: now,
    source: { url: input.url, type: detectType(input.url) },
    error: null,
  };
  writeManifest(id, job);

  const run = runRepoScript(FETCH_SCRIPT_REL, ['--id', id, '--url', input.url], FETCH_TIMEOUT_MS);
  const metaAbs = resolveInsideRepo(`${ENT_DIR_REL}/${id}/source_meta.json`);

  if (run.status === 0 && metaAbs && existsSync(metaAbs)) {
    try {
      const meta = JSON.parse(readFileSync(metaAbs, 'utf8')) as {
        durationSec?: number;
        width?: number | null;
        height?: number | null;
        fps?: number;
        hasAudio?: boolean;
      };
      job = {
        ...job,
        state: 'INTAKE_DONE',
        updatedAt: nowIso(),
        source: {
          ...job.source,
          path: `${ENT_DIR_REL}/${id}/source.mp4`,
          durationSec: meta.durationSec,
          width: meta.width ?? null,
          height: meta.height ?? null,
          fps: meta.fps,
          hasAudio: meta.hasAudio,
        },
        error: null,
      };
    } catch {
      job = { ...job, state: 'INTAKE_FAILED', updatedAt: nowIso(), error: { code: 'META_PARSE', message: 'source_meta.json không đọc được.' } };
    }
  } else {
    const stderr = run.stderr ?? '';
    const code = /DOWNLOAD_FAILED/.test(stderr)
      ? 'DOWNLOAD_FAILED'
      : /PROBE_FAILED/.test(stderr)
        ? 'PROBE_FAILED'
        : run.status === null
          ? 'TIMEOUT'
          : 'INTAKE_FAILED';
    job = { ...job, state: 'INTAKE_FAILED', updatedAt: nowIso(), error: { code, message: sanitizeError(stderr) || 'Intake thất bại.' } };
  }
  writeManifest(id, job);
  return job;
}
