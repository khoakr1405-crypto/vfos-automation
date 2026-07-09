// Job manifest IO + id helpers (extracted from scripts/vfos-job-manager.ts —
// God-file anatomy Nhịp 1). Behavior-preserving verbatim move.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { syncManifestArtifacts } from '../../job-manifest-helper.js';
import { JOBS_ROOT } from './paths.js';
import type { JobManifest, Registry } from './types.js';

export function isoNow(): string {
  return new Date().toISOString();
}

export function loadManifest(jobId: string): JobManifest | null {
  const path = resolve(JOBS_ROOT, jobId, 'job_manifest.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as JobManifest;
  } catch {
    return null;
  }
}

export function saveManifest(manifest: JobManifest): void {
  syncManifestArtifacts(manifest);

  const path = resolve(JOBS_ROOT, manifest.jobId, 'job_manifest.json');
  mkdirSync(dirname(path), { recursive: true });
  manifest.updatedAt = isoNow();
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export function todayStamp(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export function nextJobId(reg: Registry): string {
  const prefix = `job_${todayStamp()}_`;
  let maxN = 0;
  for (const j of reg.jobs) {
    if (j.jobId.startsWith(prefix)) {
      const suffix = j.jobId.slice(prefix.length);
      const n = Number.parseInt(suffix, 10);
      if (Number.isFinite(n) && n > maxN) maxN = n;
    }
  }
  if (existsSync(resolve(JOBS_ROOT))) {
    for (const entry of readdirSync(resolve(JOBS_ROOT))) {
      if (entry.startsWith(prefix)) {
        const n = Number.parseInt(entry.slice(prefix.length), 10);
        if (Number.isFinite(n) && n > maxN) maxN = n;
      }
    }
  }
  return `${prefix}${String(maxN + 1).padStart(3, '0')}`;
}

export function exists(path: string): boolean {
  return existsSync(path);
}
