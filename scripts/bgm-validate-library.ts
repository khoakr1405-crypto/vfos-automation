/**
 * VFOS BGM Library Validator — Round 51B.
 *
 * Read-only validation of a directory of BGM tracks (candidates or the promoted
 * library). For each expected track it runs ffprobe and records duration, codec,
 * sample rate, channels, bitrate and file size, then writes a runtime report.
 *
 * It does NOT call any network API, never mutates audio, and writes only the
 * report (gitignored when the target is data/temp or production/fixtures/bgm).
 *
 * Usage:
 *   tsx scripts/bgm-validate-library.ts                       # data/temp/bgm_candidates
 *   tsx scripts/bgm-validate-library.ts --dir production/fixtures/bgm
 */

import { spawnSync } from 'node:child_process';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const DEFAULT_DIR = 'data/temp/bgm_candidates';
const EXPECTED_COUNT = 20;
const DURATION_MIN = 45;
const DURATION_MAX = 75;

interface TrackProbe {
  trackId: string;
  fileName: string;
  path: string;
  exists: boolean;
  durationSec: number;
  codec: string | null;
  sampleRate: string | null;
  channels: number | null;
  bitrate: string | null;
  fileSize: number;
  audioValid: boolean;
  durationInRange: boolean;
}

function probe(filePath: string): Omit<TrackProbe, 'trackId' | 'fileName' | 'path'> {
  if (!existsSync(filePath)) {
    return {
      exists: false,
      durationSec: 0,
      codec: null,
      sampleRate: null,
      channels: null,
      bitrate: null,
      fileSize: 0,
      audioValid: false,
      durationInRange: false,
    };
  }
  const fileSize = statSync(filePath).size;
  const res = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=codec_name,sample_rate,channels,bit_rate:format=duration',
      '-of',
      'json',
      filePath,
    ],
    { encoding: 'utf8' },
  );
  if (res.status !== 0) {
    return {
      exists: true,
      durationSec: 0,
      codec: null,
      sampleRate: null,
      channels: null,
      bitrate: null,
      fileSize,
      audioValid: false,
      durationInRange: false,
    };
  }
  const data = JSON.parse(res.stdout);
  const stream = data.streams?.[0] ?? {};
  const codec = stream.codec_name ?? null;
  const durationSec = Number.parseFloat(data.format?.duration ?? '0');
  const audioValid = Boolean(codec) && durationSec > 0;
  return {
    exists: true,
    durationSec,
    codec,
    sampleRate: stream.sample_rate ?? null,
    channels: stream.channels ?? null,
    bitrate: stream.bit_rate ?? null,
    fileSize,
    audioValid,
    durationInRange: durationSec >= DURATION_MIN && durationSec <= DURATION_MAX,
  };
}

function main() {
  const { values } = parseArgs({ options: { dir: { type: 'string' } }, strict: false });
  const dir = (values.dir as string | undefined) ?? DEFAULT_DIR;
  const absDir = resolve(dir);

  console.log('======================================================');
  console.log('🎵  VFOS BGM Library Validator (read-only)');
  console.log('======================================================');
  console.log(`Target dir:      ${dir}`);
  console.log(`Expected tracks: ${EXPECTED_COUNT}`);
  console.log('------------------------------------------------------');

  const tracks: TrackProbe[] = [];
  for (let n = 1; n <= EXPECTED_COUNT; n++) {
    const id = String(n).padStart(3, '0');
    const fileName = `bgm_${id}.mp3`;
    const filePath = join(absDir, fileName);
    const p = probe(filePath);
    tracks.push({ trackId: `bgm_${id}`, fileName, path: `${dir}/${fileName}`, ...p });
    const flag = !p.exists ? '❌ MISSING' : p.audioValid && p.durationInRange ? '✅' : '⚠️ INVALID';
    console.log(
      `${flag}  bgm_${id}  ${p.durationSec.toFixed(1)}s  ${p.codec ?? '-'}  ${p.sampleRate ?? '-'}Hz  ${p.channels ?? '-'}ch  ${Math.round(p.fileSize / 1024)}KB`,
    );
  }

  const present = tracks.filter((t) => t.exists).length;
  const valid = tracks.filter((t) => t.audioValid && t.durationInRange).length;
  const report = {
    bgmValidationVersion: 'v1',
    generatedAt: new Date().toISOString(),
    targetDir: dir,
    expected: EXPECTED_COUNT,
    present,
    valid,
    allValid: valid === EXPECTED_COUNT,
    durationWindowSec: [DURATION_MIN, DURATION_MAX],
    tracks,
  };
  const reportPath = join(absDir, 'bgm_validation_report.json');
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('------------------------------------------------------');
  console.log(`Present: ${present}/${EXPECTED_COUNT} | Valid: ${valid}/${EXPECTED_COUNT}`);
  console.log(`Report:  ${dir}/bgm_validation_report.json`);
  process.exit(valid === EXPECTED_COUNT ? 0 : 4);
}

main();
