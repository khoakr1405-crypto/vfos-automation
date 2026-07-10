// ffmpeg-runner (RFC §2 — R2, LỚP I/O). Đây là NƠI DUY NHẤT trong package chạm ổ
// cứng + gọi FFmpeg. Chỉ là HÀM export cho bên ngoài gọi — KHÔNG tự kích hoạt,
// KHÔNG CLI (dành R3). Logic dựng chuỗi vẫn nằm ở filter-graph/ass-writer (thuần).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { buildAss } from './ass-writer.js';
import { buildFfmpegPlan } from './filter-graph.js';
import type { RenderOptions, RenderPlanInput, RenderResult } from './types.js';

const DEFAULT_ASS_FILE = 'render_subs.ass';
const STDERR_TAIL_CHARS = 4000;
// stderr ffmpeg có thể rất dài (progress từng frame) → nới maxBuffer.
const MAX_BUFFER = 64 * 1024 * 1024;

function tail(text: string, n = STDERR_TAIL_CHARS): string {
  return text.length > n ? text.slice(text.length - n) : text;
}

function absolutize(p: string, baseDir: string): string {
  return isAbsolute(p) ? p : resolve(baseDir, p);
}

/**
 * Preflight: xác nhận ffmpeg tồn tại trên PATH (hoặc ffmpegPath tuỳ chọn). Fail-fast
 * TRƯỚC khi ghi file/tiêu tài nguyên. Ném lỗi rõ nếu thiếu.
 */
export function assertFfmpegAvailable(ffmpegPath = 'ffmpeg'): void {
  const probe = spawnSync(ffmpegPath, ['-version'], { encoding: 'utf-8' });
  if (probe.error || probe.status !== 0) {
    const reason = probe.error ? probe.error.message : `exit ${probe.status}`;
    throw new Error(
      `FFMPEG_NOT_FOUND: không gọi được '${ffmpegPath} -version' (${reason}). Cài FFmpeg và đảm bảo nó nằm trên PATH hệ thống.`,
    );
  }
}

/** Ráp argv ffmpeg từ FfmpegPlan: -i inputs (tuyệt đối) → filter_complex → maps → encode → output. */
function buildArgv(
  inputs: string[],
  filterComplex: string,
  maps: string[],
  encodeArgs: string[],
  outputPath: string,
): string[] {
  const argv: string[] = [];
  for (const input of inputs) argv.push('-i', input);
  argv.push('-filter_complex', filterComplex);
  for (const m of maps) argv.push('-map', m);
  argv.push(...encodeArgs, outputPath);
  return argv;
}

/**
 * Render 1 video từ RenderPlan. Luồng: preflight ffmpeg → ghi render_subs.ass vào
 * jobDir → spawnSync ffmpeg (cwd=jobDir để đọc đúng path .ass tương đối) → exit≠0
 * thì ném lỗi kèm stderr; thành công thì trả RenderResult.
 *
 * Path input/output trong plan được resolve tuyệt đối theo baseDir (mặc định
 * process.cwd()) nên độc lập với cwd; chỉ file .ass dùng tên trần + cwd=jobDir.
 */
export function renderVideo(plan: RenderPlanInput, options: RenderOptions): RenderResult {
  const { jobDir } = options;
  const baseDir = options.baseDir ?? process.cwd();
  const assFileName = options.assFileName ?? DEFAULT_ASS_FILE;
  const ffmpegPath = options.ffmpegPath ?? 'ffmpeg';
  const subtitleTiming = plan.subtitleTiming ?? 'perfect_match';

  // 1) Preflight — fail-fast trước mọi side-effect.
  assertFfmpegAvailable(ffmpegPath);

  // 2) Dựng kế hoạch (thuần) + ghi file phụ đề vào jobDir.
  const ffmpegPlan = buildFfmpegPlan(plan, { assFileName });
  mkdirSync(jobDir, { recursive: true });
  if (ffmpegPlan.hasSubtitles) {
    const assContent = buildAss(plan.subtitles, plan.subtitleStyle, plan.canvas);
    // UTF-8 BOM để libass đọc đúng tiếng Việt (đồng bộ kinetic-caption-renderer).
    writeFileSync(join(jobDir, assFileName), `﻿${assContent}`, 'utf-8');
  }

  // 3) Thực thi FFmpeg với cwd=jobDir; input/output tuyệt đối.
  const inputs = ffmpegPlan.inputs.map((i) => absolutize(i.path, baseDir));
  const outputAbs = absolutize(ffmpegPlan.outputPath, baseDir);
  const argv = buildArgv(
    inputs,
    ffmpegPlan.filterComplex,
    ffmpegPlan.maps,
    ffmpegPlan.encodeArgs,
    outputAbs,
  );
  const run = spawnSync(ffmpegPath, argv, {
    cwd: jobDir,
    encoding: 'utf-8',
    maxBuffer: MAX_BUFFER,
  });

  const stderr = typeof run.stderr === 'string' ? run.stderr : '';

  // 4) Xử lý kết quả.
  if (run.error) {
    throw new Error(`FFMPEG_SPAWN_FAILED: ${run.error.message}`);
  }
  if (run.status !== 0) {
    throw new Error(`FFMPEG_RENDER_FAILED (exit ${run.status}). stderr tail:\n${tail(stderr)}`);
  }
  if (!existsSync(outputAbs)) {
    throw new Error(`FFMPEG_NO_OUTPUT: exit 0 nhưng không thấy file ${outputAbs}.`);
  }

  const warnings: string[] = [];
  if (subtitleTiming === 'proportional_fallback') {
    warnings.push('SUBTITLE_TIMING_APPROX: phụ đề dùng proportional_fallback (timing xấp xỉ).');
  }
  if (!ffmpegPlan.hasSubtitles) {
    warnings.push('NO_SUBTITLES: render_plan không có cue phụ đề nào.');
  }

  return {
    ok: true,
    outputPath: outputAbs,
    exitCode: 0,
    durationSec: ffmpegPlan.durationSec,
    subtitleTiming,
    warnings,
    stderrTail: tail(stderr, 1200),
  };
}
