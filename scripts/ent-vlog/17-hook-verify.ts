// E1 step 17 — TITLE VERIFY (post-render, FULL-RATE, TOÀN VIDEO, READ-ONLY).
// Quét MỌI frame của TOÀN BỘ render cuối (mặc định) ở ĐÚNG fps nguồn (không thưa 1fps
// như lần trước) → PaddleOCR → bắt mọi title-card Trung lọt vào video (hook HOẶC thân),
// kể cả flash 1 frame (~0.03s). PASS khi 0 frame dính title; FAIL + liệt kê mốc/giây.
// Dùng CHUNG tiêu chí title với 03e (lib/title-gate) → verify không nới lỏng hơn gate.
// --window N để giới hạn cửa sổ (debug). KHÔNG render/publish/LLM. Ghi hook_verify.json.
// Exit 0=PASS, 4=FAIL, 2/3=thiếu input.
//   pnpm tsx scripts/ent-vlog/17-hook-verify.ts --id <ent_job_id> [--video <path>] [--window N]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { workDir } from './lib/env.js';
import { type OcrRegion, firstTitleRegion } from './lib/title-gate.js';

const PADDLE_PY = 'tools/subtitle-detect-paddle/.venv/Scripts/python.exe';
const PADDLE_SCRIPT = 'tools/subtitle-detect-paddle/detect.py';
const DET_WIDTH = 384; // KHỚP gate 03e → cùng độ phân giải phát hiện
const DEFAULT_WINDOW = 6; // fallback nếu không probe được duration (thường = toàn video)
const FPS_CAP = 60; // verify quét tới 60fps (đủ bắt flash 1 frame mọi source)

// Render cuối ưu tiên theo thứ tự (ambient = thành phẩm sau audio policy).
const RENDER_CANDIDATES = ['montage_v2_short_ambient.mp4', 'montage_v2_short.mp4'];

interface PaddleOut {
  frames?: Array<{ file: string; regions?: OcrRegion[] }>;
}
interface TitleHit {
  tSec: number;
  text: string;
  score: number;
  box: [number, number, number, number];
}

function ffprobeFps(video: string): number {
  const r = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=r_frame_rate',
      '-of',
      'csv=p=0',
      video,
    ],
    { encoding: 'utf-8' },
  );
  const m = /(\d+)\s*\/\s*(\d+)/.exec(`${r.stdout ?? ''}`);
  const fps = m ? Number(m[1]) / Number(m[2]) : Number(`${r.stdout ?? ''}`.trim());
  return Number.isFinite(fps) && fps > 0 ? fps : 30;
}

/** Thời lượng video (giây) → để verify quét TOÀN BỘ mặc định (không chỉ hook). */
function ffprobeDuration(video: string): number {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video],
    { encoding: 'utf-8' },
  );
  const d = Number(`${r.stdout ?? ''}`.trim());
  return Number.isFinite(d) && d > 0 ? d : 0;
}

function ffprobeWH(img: string): { w: number; h: number } {
  const r = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
      '-of',
      'csv=p=0:s=x',
      img,
    ],
    { encoding: 'utf-8' },
  );
  const m = /(\d+)x(\d+)/.exec(`${r.stdout ?? ''}`);
  return { w: Number(m?.[1] ?? DET_WIDTH), h: Number(m?.[2] ?? DET_WIDTH) };
}

function fail(code: number, msg: string): never {
  console.error(`🛑 ${msg}`);
  process.exit(code);
}

function main(): void {
  const { values } = parseArgs({
    options: {
      id: { type: 'string' },
      video: { type: 'string' },
      window: { type: 'string' },
      out: { type: 'string' },
    },
    strict: true,
  });
  const id = values.id;
  if (!id)
    fail(1, 'Usage: --id <ent_job_id> [--video <path>] [--window <sec, mặc định TOÀN video>]');
  const dir = workDir(id);

  // Resolve render cuối.
  let video = values.video ? resolve(values.video) : '';
  if (!video) {
    for (const name of RENDER_CANDIDATES) {
      const p = join(dir, name);
      if (existsSync(p)) {
        video = p;
        break;
      }
    }
  }
  if (!video || !existsSync(video)) {
    fail(
      2,
      `Không tìm thấy bản render cuối (${RENDER_CANDIDATES.join(' / ')}) trong ${dir}. Render trước rồi verify.`,
    );
  }
  if (!existsSync(resolve(PADDLE_PY)) || !existsSync(resolve(PADDLE_SCRIPT))) {
    fail(3, 'PaddleOCR venv/script thiếu — không OCR được, KHÔNG thể verify (không PASS giả).');
  }

  const fps = Math.min(FPS_CAP, Math.max(10, Math.round(ffprobeFps(video))));
  // Mặc định quét TOÀN BỘ video (title-card Trung có thể ở thân, không chỉ hook).
  // --window N để giới hạn (vd debug hook). Lề +0.5s cho chắc chạm cuối.
  const fullDur = ffprobeDuration(video);
  const window = values.window
    ? Math.max(1, Number(values.window))
    : fullDur > 0
      ? Math.ceil(fullDur + 0.5)
      : DEFAULT_WINDOW;
  const outPath = values.out ? resolve(values.out) : join(dir, 'hook_verify.json');

  // 1) Cắt MỌI frame [0..window] ở full-rate.
  const framesDir = resolve('data/temp', `hookverify-${id}`);
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });
  const cut = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-ss',
      '0',
      '-i',
      video,
      '-t',
      String(window),
      '-vf',
      `fps=${fps},scale='min(${DET_WIDTH},iw)':-2`,
      join(framesDir, 'v_%05d.png'),
      '-loglevel',
      'error',
    ],
    { encoding: 'utf-8' },
  );
  const frameFiles = readdirSync(framesDir)
    .filter((f) => f.endsWith('.png'))
    .sort();
  if (cut.status !== 0 || frameFiles.length === 0) {
    fail(3, `Không cắt được frame hook để verify (ffmpeg exit ${cut.status}).`);
  }
  const { w: fW, h: fH } = ffprobeWH(join(framesDir, frameFiles[0] ?? ''));

  // 2) PaddleOCR 1 lần toàn bộ frame hook.
  console.log(
    `[17] Verify title ${basename(video)} — ${frameFiles.length} frame @ ${fps}fps (0–${window}s, toàn video)…`,
  );
  const outJson = join(framesDir, 'paddle_out.json');
  const pr = spawnSync(
    resolve(PADDLE_PY),
    [resolve(PADDLE_SCRIPT), '--frames-dir', framesDir, '--out', outJson, '--lang', 'ch'],
    { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (pr.status !== 0 || !existsSync(outJson)) {
    fail(3, `PaddleOCR lỗi: ${(pr.stderr ?? '').slice(-400)}`);
  }
  const pdata = JSON.parse(readFileSync(outJson, 'utf8')) as PaddleOut;

  // 3) Frame nào dính title (chữ Trung lớn vùng giữa/trên)? → mốc giây trong render.
  const hits: TitleHit[] = [];
  for (const fr of pdata.frames ?? []) {
    const m = /^v_(\d+)\.png$/.exec(fr.file);
    if (!m) continue;
    const tr = firstTitleRegion(fr.regions, fW, fH);
    if (tr) {
      hits.push({
        tSec: Number(((Number(m[1]) - 1) / fps).toFixed(3)),
        text: tr.text,
        score: tr.score,
        box: tr.box,
      });
    }
  }
  hits.sort((a, b) => a.tSec - b.tSec);
  const pass = hits.length === 0;

  writeFileSync(
    outPath,
    JSON.stringify(
      {
        videoId: id,
        video: basename(video),
        engine: 'paddle-ocr-fullrate-verify',
        window,
        fps,
        frameCount: frameFiles.length,
        pass,
        titleHits: hits,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  rmSync(framesDir, { recursive: true, force: true });

  console.log('======================================================');
  console.log(`[17] TITLE VERIFY — ${id} (${basename(video)})`);
  console.log(
    `  quét ${frameFiles.length} frame @ ${fps}fps trên 0–${window}s (full-rate, toàn video)`,
  );
  if (pass) {
    console.log('  ✅ PASS — KHÔNG frame nào dính title-card Trung trong toàn video.');
  } else {
    console.log(`  🛑 FAIL — ${hits.length} frame dính title:`);
    for (const h of hits.slice(0, 20)) {
      console.log(`     t=${h.tSec}s  "${h.text}"  score=${h.score}  box=[${h.box.join(',')}]`);
    }
    if (hits.length > 20) console.log(`     …(+${hits.length - 20} frame nữa)`);
  }
  console.log(`  → ${outPath}`);
  console.log('======================================================');

  process.exit(pass ? 0 : 4);
}

main();
