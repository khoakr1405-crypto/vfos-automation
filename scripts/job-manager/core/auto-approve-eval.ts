// Auto-Approve eval helpers (Phần 82) — shared I/O primitives for both lane gates.
//
// Not pure (does ffmpeg/ffprobe/fetch) so it lives beside auto-approve-core.ts but
// separate from it: the pure contract stays unit-testable, the I/O lives here. Reused
// by the PR worker (scripts/job-auto-approve.ts) and the ENT gate
// (scripts/ent-vlog/18-auto-approve.ts). Frame extraction mirrors
// scripts/job-video-vision-analyzer.ts; the 429/5xx backoff reuses the canonical
// escalating-floor policy from packages/ai-agents (same source the vision analyzer uses).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_RATE_LIMIT_WAITS,
  escalatingFloorMs,
  sleep,
} from '../../../packages/ai-agents/src/script-claim-safety/openai-caller.js';

export interface FrameInfo {
  index: number;
  timestampSec: number;
  path: string;
}

export interface AudioHealth {
  hasAudio: boolean;
  meanVolumeDb: number | null;
  maxVolumeDb: number | null;
  /** longest continuous silence run (seconds) at/above the reporting floor. */
  maxSilenceRunSec: number;
  clipping: boolean;
}

/** Probe duration (seconds) via ffprobe. Returns 0 on failure (caller decides). */
export function getVideoDurationSec(videoAbs: string): number {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', videoAbs],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) return 0;
  const d = Number.parseFloat((r.stdout ?? '').trim());
  return Number.isFinite(d) && d > 0 ? d : 0;
}

/**
 * Extract one JPEG per timestamp via ffmpeg (mirror job-video-vision-analyzer). Only
 * frames that actually land on disk are returned — a failed extraction is skipped, not
 * fatal (the caller's fail-closed rollup handles a short frame set).
 */
export function extractFrames(videoAbs: string, timestamps: number[], outDir: string): FrameInfo[] {
  mkdirSync(outDir, { recursive: true });
  const frames: FrameInfo[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    if (ts === undefined) continue;
    const framePath = join(outDir, `frame_${String(i + 1).padStart(3, '0')}.jpg`);
    const r = spawnSync(
      'ffmpeg',
      ['-y', '-ss', String(ts), '-i', videoAbs, '-frames:v', '1', '-q:v', '3', framePath],
      { encoding: 'utf8' },
    );
    if (r.status === 0 && existsSync(framePath)) {
      frames.push({ index: i + 1, timestampSec: ts, path: framePath });
    }
  }
  return frames;
}

/** Read a frame file as base64 (for the vision data-URL payload). */
export function frameToBase64(framePath: string): string {
  return readFileSync(framePath).toString('base64');
}

/**
 * Local (no-API) audio health over the final clip: mean/max volume + longest silence
 * run. silencedetect floor d=1s so we can tell whether any run crosses the dead-air
 * threshold the caller applies. clipping = max volume at/above -0.1 dBFS.
 */
export function analyzeAudioHealth(videoAbs: string): AudioHealth {
  const probe = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'a',
      '-show_entries',
      'stream=codec_type',
      '-of',
      'csv=p=0',
      videoAbs,
    ],
    { encoding: 'utf8' },
  );
  const hasAudio = (probe.stdout ?? '').includes('audio');
  if (!hasAudio) {
    return {
      hasAudio: false,
      meanVolumeDb: null,
      maxVolumeDb: null,
      maxSilenceRunSec: 0,
      clipping: false,
    };
  }
  const r = spawnSync(
    'ffmpeg',
    ['-i', videoAbs, '-af', 'silencedetect=noise=-30dB:d=1,volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  const err = `${r.stderr ?? ''}`;
  const mean = /mean_volume:\s*(-?[\d.]+)\s*dB/.exec(err);
  const max = /max_volume:\s*(-?[\d.]+)\s*dB/.exec(err);
  let maxSilenceRunSec = 0;
  const silRe = /silence_duration:\s*([\d.]+)/g;
  let m: RegExpExecArray | null = silRe.exec(err);
  while (m !== null) {
    const dur = Number.parseFloat(m[1] ?? '0');
    if (Number.isFinite(dur) && dur > maxSilenceRunSec) maxSilenceRunSec = dur;
    m = silRe.exec(err);
  }
  const meanVolumeDb = mean ? Number.parseFloat(mean[1] ?? '') : null;
  const maxVolumeDb = max ? Number.parseFloat(max[1] ?? '') : null;
  return {
    hasAudio: true,
    meanVolumeDb: Number.isFinite(meanVolumeDb as number) ? meanVolumeDb : null,
    maxVolumeDb: Number.isFinite(maxVolumeDb as number) ? maxVolumeDb : null,
    maxSilenceRunSec,
    clipping: maxVolumeDb !== null && maxVolumeDb >= -0.1,
  };
}

/**
 * Retry an OpenAI-shaped call on transient 429 / 5xx. The lane's openai helpers throw
 * an Error whose message carries `HTTP <status>`; we detect 429/5xx there and wait the
 * canonical escalating floor (15→30→60→75s) before retrying. Non-transient errors
 * rethrow immediately. Exhausting retries rethrows so the caller maps it to NEEDS_HUMAN
 * (fail-closed) — a rate-limited gate never silently passes.
 */
export async function withOpenAiRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RATE_LIMIT_WAITS + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const transient = /HTTP 429\b/.test(msg) || /HTTP 5\d\d\b/.test(msg);
      if (!transient || attempt > MAX_RATE_LIMIT_WAITS) throw err;
      const waitMs = escalatingFloorMs(attempt);
      console.warn(
        `⚠️  auto-approve ${label}: transient (${msg.slice(0, 80)}) — chờ ${Math.round(waitMs / 1000)}s (lần ${attempt}/${MAX_RATE_LIMIT_WAITS})`,
      );
      await sleep(waitMs);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Download an image URL to a local file for the GUARD-8 visual match. Returns false on
 * any failure (bad URL, non-2xx, non-image) so the caller marks the product-match check
 * NEEDS_HUMAN rather than fabricating a verdict. redirect:'error' keeps a product-image
 * host from bouncing the fetch somewhere unexpected.
 */
export async function downloadImageToFile(url: string, outPath: string): Promise<boolean> {
  try {
    const res = await fetch(url, { redirect: 'error' });
    if (!res.ok) return false;
    const type = res.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0) return false;
    const { writeFileSync } = await import('node:fs');
    writeFileSync(outPath, buf);
    return true;
  } catch {
    return false;
  }
}
