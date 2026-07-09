// ffprobe-based media probes (extracted from scripts/vfos-job-manager.ts —
// God-file anatomy Nhịp 1). Behavior-preserving move; only isNaN → Number.isNaN
// (biome noGlobalIsNan, identical for numeric input).

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export function hasVideoStream(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const result = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v',
      '-show_entries',
      'stream=index',
      '-of',
      'csv=p=0',
      filePath,
    ],
    { encoding: 'utf8' },
  );
  return result.status === 0 && result.stdout.trim().length > 0;
}

export function getVideoDuration(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  const args = [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ];
  const result = spawnSync('ffprobe', args, { encoding: 'utf8' });
  if (result.status === 0) {
    const val = Number.parseFloat(result.stdout.trim());
    if (!Number.isNaN(val)) return val;
  }
  return 0;
}

export function getVoiceDuration(filePath: string): number {
  return getVideoDuration(filePath); // Alias since ffprobe does both the same way
}

export function hasAudioStream(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const result = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'a',
      '-show_entries',
      'stream=index',
      '-of',
      'csv=p=0',
      filePath,
    ],
    { encoding: 'utf8' },
  );
  return result.status === 0 && result.stdout.trim().length > 0;
}
