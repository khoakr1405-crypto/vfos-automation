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

/** Kết quả kiểm tra audio stream (extracted from review-video-orchestrator — N1). */
export interface AudioStreamCheck {
  success: boolean;
  error?: string;
  reason?: string;
  duration?: number;
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  duration?: string;
}

/**
 * Verify file có audio stream hợp lệ (codec đọc được + duration > 0) — dùng cho
 * AudioGuard của pipeline review. Behavior-preserving move từ orchestrator.
 */
export function validateAudioStream(filePath: string): AudioStreamCheck {
  if (!existsSync(filePath)) {
    return { success: false, error: 'FILE_NOT_FOUND', reason: `File not found at: ${filePath}` };
  }

  const args = [
    '-v',
    'error',
    '-show_entries',
    'stream=index,codec_type,codec_name,duration',
    '-show_format',
    '-of',
    'json',
    filePath,
  ];

  const result = spawnSync('ffprobe', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    return {
      success: false,
      error: 'FFPROBE_FAILED',
      reason: `ffprobe exited with status ${result.status}. Stderr: ${result.stderr}`,
    };
  }

  try {
    const data = JSON.parse(result.stdout || '{}') as {
      streams?: FfprobeStream[];
      format?: { duration?: string };
    };
    const streams = data.streams || [];
    const audioStream = streams.find((s) => s.codec_type === 'audio');

    if (!audioStream) {
      return {
        success: false,
        error: 'NO_AUDIO_STREAM',
        reason: 'No audio stream found in the file.',
      };
    }

    const duration = Number.parseFloat(audioStream.duration || data.format?.duration || '0');
    if (Number.isNaN(duration) || duration <= 0) {
      return {
        success: false,
        error: 'INVALID_DURATION',
        reason: `Audio duration is invalid or zero: ${audioStream.duration || data.format?.duration}`,
      };
    }

    const codec = audioStream.codec_name;
    if (!codec || codec === 'unknown') {
      return {
        success: false,
        error: 'INVALID_CODEC',
        reason: `Audio codec is invalid or unknown: ${codec}`,
      };
    }

    return { success: true, duration };
  } catch (err) {
    return {
      success: false,
      error: 'PARSE_FAILED',
      reason: `Failed to parse ffprobe output: ${(err as Error).message}`,
    };
  }
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
