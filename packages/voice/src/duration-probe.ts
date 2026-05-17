import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DurationProbeResult } from './types.js';

const execFileAsync = promisify(execFile);

interface FfprobeOutput {
  format?: {
    duration?: string;
    format_name?: string;
    bit_rate?: string;
  };
}

export async function probeAudioDuration(
  audioPath: string,
  ffprobePath?: string,
): Promise<DurationProbeResult> {
  const probe = ffprobePath ?? resolveFFprobe();

  const { stdout } = await execFileAsync(probe, [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    audioPath,
  ]);

  const parsed = JSON.parse(stdout) as FfprobeOutput;
  const fmt = parsed.format;

  if (!fmt?.duration) {
    throw new Error(`ffprobe could not determine duration for: ${audioPath}`);
  }

  return {
    duration_s: parseFloat(fmt.duration),
    format: fmt.format_name ?? 'unknown',
    bitrate_bps: fmt.bit_rate ? parseInt(fmt.bit_rate, 10) : 0,
  };
}

function resolveFFprobe(): string {
  // Check env var first; fall back to PATH
  return process.env['FFPROBE_PATH'] ?? 'ffprobe';
}
