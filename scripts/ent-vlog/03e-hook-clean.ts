// E1 step 03e — HOOK CLEAN PICKER (RV1.5-fix, OCR title-gate).
// Chọn 1–2 cú money-shot MẠNH NHẤT làm hook 0–5s NHƯNG loại bỏ frame dính
// TITLE-CARD Trung (chữ lớn giữa khung — khác sub đáy đã blur). Quét PaddleOCR
// per-frame các cú ứng viên; cú/đoạn dính title → loại hoặc trim. Ghi hook_clean.json.
// READ-ONLY nguồn — KHÔNG render/publish/LLM. Idempotent (skip nếu đã có, --force ép lại).
//   pnpm tsx scripts/ent-vlog/03e-hook-clean.ts --id <ent_job_id> [--force]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { workDir } from './lib/env.js';
import { STORY_BUDGET } from './lib/story-arc.js';
import { type OcrRegion, TITLE_GATE, frameHasTitle } from './lib/title-gate.js';

const PADDLE_PY = 'tools/subtitle-detect-paddle/.venv/Scripts/python.exe';
const PADDLE_SCRIPT = 'tools/subtitle-detect-paddle/detect.py';

// Quét: lấy TOP cú vision mạnh nhất (ngoài vùng intro), OCR cửa sổ quanh mỗi cú.
const CAND_TOP = 6;
const SCAN_LEAD = 1.3; // quét từ trước cú
const SCAN_TAIL = 2.5; // …đến sau cú (phủ trọn tầm shot)
// FULL-RATE: quét đúng fps NGUỒN trong cửa sổ ứng viên → KHÔNG trượt khe flash
// title <0.1s (10fps cũ vẫn lọt 1–2 frame). Cửa sổ hẹp (~3.8s/cú) nên chi phí ok.
const SCAN_FPS_CAP = 30; // trần (source 60fps → vẫn quét 30, đủ bắt flash 1 frame)
const DET_WIDTH = 384; // hạ pixel cho paddle CPU nhanh
// SETUP intro: source thường mở đầu bằng title-card overlay ~0.1–3s ở src 0.0.
// Setup lấy từ src 0.0 nên liếm trúng → quét OCR src[0..N], skip qua title.
const INTRO_SCAN_SEC = 3.5;
const SETUP_SKIP_MARGIN = 0.5; // skip thêm sau frame title cuối
const SETUP_SKIP_MAX = 3.0; // không skip quá (giữ setup vẫn lấy được cảnh sớm)

// TITLE zone/thresholds dùng CHUNG với verify (lib/title-gate) — KHÔNG khai báo lại
// ở đây để gate↔verify không lệch ngưỡng. Còn lại là tham số riêng của bước chọn:
const PEAK_DIRTY_TOL = 0.25; // dirty trong ±0.25s quanh cú → coi như cú bẩn, loại
const MIN_CLEAN_LEN = 1.8; // đoạn sạch quanh cú phải ≥1.8s mới dùng

interface PaddleOut {
  frames?: Array<{ file: string; regions?: OcrRegion[] }>;
}

/** fps nguồn (r_frame_rate "30/1") → số; lỗi → 30. Dùng để quét full-rate. */
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

interface Cand {
  tSec: number;
  score: number;
  scanStart: number;
  prefix: string;
}

function main(): void {
  const { values } = parseArgs({
    options: { id: { type: 'string' }, force: { type: 'boolean', default: false } },
    strict: true,
  });
  const id = values.id;
  if (!id) {
    console.error('Usage: --id <ent_job_id> [--force]');
    process.exit(1);
  }
  const dir = workDir(id);
  const outPath = join(dir, 'hook_clean.json');
  if (existsSync(outPath) && !values.force) {
    console.log('[03e] hook_clean.json đã có → skip (dùng --force để quét lại).');
    return;
  }
  for (const f of ['source_meta.json', 'catch_moments.json']) {
    if (!existsSync(join(dir, f))) {
      console.error(`🛑 MISSING ${f} — cần analyze trước. Không bịa.`);
      process.exit(2);
    }
  }
  const meta = JSON.parse(readFileSync(join(dir, 'source_meta.json'), 'utf8')) as {
    path: string;
    durationSec: number;
  };
  const cm = JSON.parse(readFileSync(join(dir, 'catch_moments.json'), 'utf8')) as {
    moments?: Array<{ tSec: number; score: number }>;
  };
  const moments = [...(cm.moments ?? [])];
  const dur = meta.durationSec;
  // Quét đúng fps NGUỒN (full-rate) trong cửa sổ ứng viên — không trượt khe flash title.
  const scanFps = Math.min(SCAN_FPS_CAP, Math.max(10, Math.round(ffprobeFps(meta.path))));

  // Ứng viên: cú có tSec ≥ guard (qua vùng intro/title đầu source), mạnh nhất trước.
  const cands = moments
    .filter((m) => m.tSec >= STORY_BUDGET.hookGuardSrcSec)
    .sort((a, b) => b.score - a.score)
    .slice(0, CAND_TOP);

  if (cands.length === 0) {
    writeFileSync(
      outPath,
      JSON.stringify(
        {
          videoId: id,
          engine: 'paddle-ocr-gate',
          shots: [],
          note: 'no candidate',
          generatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    console.log('[03e] Không có cú ứng viên (qua guard) → hook_clean rỗng (fallback no-hook).');
    return;
  }

  if (!existsSync(resolve(PADDLE_PY)) || !existsSync(resolve(PADDLE_SCRIPT))) {
    console.error(
      '🛑 PaddleOCR venv/script thiếu — không OCR được, KHÔNG ghi hook (tránh hook bẩn).',
    );
    process.exit(3);
  }

  // 1) Cắt frame cho mọi ứng viên vào 1 thư mục (1 lần init paddle).
  const framesDir = resolve('data/temp', `hookscan-${id}`);
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });
  const cs: Cand[] = cands.map((m, i) => {
    const scanStart = Math.max(0, m.tSec - SCAN_LEAD);
    const scanEnd = Math.min(dur, m.tSec + SCAN_TAIL);
    const prefix = `c${i}`;
    const ok = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-ss',
        String(scanStart),
        '-i',
        meta.path,
        '-t',
        String(scanEnd - scanStart),
        '-vf',
        `fps=${scanFps},scale='min(${DET_WIDTH},iw)':-2`,
        join(framesDir, `${prefix}_%04d.png`),
        '-loglevel',
        'error',
      ],
      { encoding: 'utf-8' },
    );
    if (ok.status !== 0) console.warn(`[03e] ffmpeg cắt frame cú ${i} (t=${m.tSec}) lỗi.`);
    return { tSec: m.tSec, score: m.score, scanStart, prefix };
  });

  // Frame setup-intro (src 0 → INTRO_SCAN) để dò title-card mở đầu source.
  spawnSync(
    'ffmpeg',
    [
      '-y',
      '-ss',
      '0',
      '-i',
      meta.path,
      '-t',
      String(INTRO_SCAN_SEC),
      '-vf',
      `fps=${scanFps},scale='min(${DET_WIDTH},iw)':-2`,
      join(framesDir, 'setup_%04d.png'),
      '-loglevel',
      'error',
    ],
    { encoding: 'utf-8' },
  );

  const frameFiles = readdirSync(framesDir).filter((f) => f.endsWith('.png'));
  if (frameFiles.length === 0) {
    console.error('🛑 Không cắt được frame nào để OCR.');
    process.exit(3);
  }
  const { w: fW, h: fH } = ffprobeWH(join(framesDir, frameFiles.sort()[0] ?? ''));

  // 2) PaddleOCR 1 lần cho toàn bộ frame.
  console.log(`[03e] PaddleOCR ${frameFiles.length} frame (${cs.length} cú ứng viên)…`);
  const outJson = join(framesDir, 'paddle_out.json');
  const pr = spawnSync(
    resolve(PADDLE_PY),
    [resolve(PADDLE_SCRIPT), '--frames-dir', framesDir, '--out', outJson, '--lang', 'ch'],
    { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (pr.status !== 0 || !existsSync(outJson)) {
    console.error('🛑 PaddleOCR lỗi:', (pr.stderr ?? '').slice(-400));
    process.exit(3);
  }
  const pdata = JSON.parse(readFileSync(outJson, 'utf8')) as PaddleOut;

  // 3) Frame nào có TITLE (chữ Trung lớn giữa khung)? → map ra dirty time theo từng cú.
  //    Tiêu chí title = lib/title-gate (CHUNG với verify 17 → không lệch ngưỡng).
  const isTitleFrame = (regions: OcrRegion[] | undefined): boolean =>
    frameHasTitle(regions, fW, fH);

  const dirtyByCand = new Map<string, number[]>(); // prefix → dirty source-times
  const setupTitleTimes: number[] = []; // src-time có title trong intro setup
  for (const fr of pdata.frames ?? []) {
    const mc = /^(c\d+)_(\d+)\.png$/.exec(fr.file);
    if (mc) {
      const prefix = mc[1] ?? '';
      const seq = Number(mc[2]);
      const cand = cs.find((c) => c.prefix === prefix);
      if (cand && isTitleFrame(fr.regions)) {
        const tSrc = cand.scanStart + (seq - 1) / scanFps;
        const arr = dirtyByCand.get(prefix) ?? [];
        arr.push(tSrc);
        dirtyByCand.set(prefix, arr);
      }
      continue;
    }
    const ms = /^setup_(\d+)\.png$/.exec(fr.file);
    if (ms && isTitleFrame(fr.regions)) setupTitleTimes.push((Number(ms[1]) - 1) / scanFps);
  }
  // Setup bắt đầu SAU title-card intro (nếu có). 0 = không có title → giữ src 0.
  const setupSrcStart =
    setupTitleTimes.length > 0
      ? Math.min(SETUP_SKIP_MAX, Math.max(...setupTitleTimes) + SETUP_SKIP_MARGIN)
      : 0;

  // 4) Mỗi cú: đoạn SẠCH quanh tSec (không title). Loại nếu cú bẩn / đoạn sạch quá ngắn.
  interface Clean {
    tSec: number;
    score: number;
    cleanStart: number;
    cleanEnd: number;
  }
  const cleanCands: Clean[] = [];
  const rejected: Array<{ tSec: number; reason: string }> = [];
  for (const c of cs) {
    const dirty = (dirtyByCand.get(c.prefix) ?? []).sort((a, b) => a - b);
    const scanEnd = Math.min(dur, c.tSec + SCAN_TAIL);
    const peakDirty = dirty.some((d) => Math.abs(d - c.tSec) <= PEAK_DIRTY_TOL);
    if (peakDirty) {
      rejected.push({ tSec: c.tSec, reason: 'title ngay tại cú' });
      continue;
    }
    const lastBefore = dirty.filter((d) => d < c.tSec).pop();
    const firstAfter = dirty.find((d) => d > c.tSec);
    const cleanStart = lastBefore != null ? lastBefore + 0.2 : c.scanStart;
    const cleanEnd = firstAfter != null ? firstAfter - 0.2 : scanEnd;
    if (cleanEnd - cleanStart < MIN_CLEAN_LEN) {
      rejected.push({
        tSec: c.tSec,
        reason: `đoạn sạch ${(cleanEnd - cleanStart).toFixed(2)}s < ${MIN_CLEAN_LEN}s`,
      });
      continue;
    }
    cleanCands.push({ tSec: c.tSec, score: c.score, cleanStart, cleanEnd });
  }

  // 5) Chọn tối đa 2 cú sạch (mạnh nhất trước, cách nhau ≥ gap) → shot window cắt trong đoạn sạch.
  const B = STORY_BUDGET;
  const mkShot = (cl: Clean, lead: number, reaction: number) => {
    let s = Math.max(cl.cleanStart, cl.tSec - lead);
    let e = Math.min(cl.cleanEnd, cl.tSec + reaction);
    // nếu một phía bị cụt, bù phía kia trong đoạn sạch để giữ độ dài.
    const want = lead + reaction;
    if (e - s < want) {
      if (s <= cl.cleanStart + 0.01) e = Math.min(cl.cleanEnd, s + want);
      else if (e >= cl.cleanEnd - 0.01) s = Math.max(cl.cleanStart, e - want);
    }
    return {
      tSec: Number(cl.tSec.toFixed(1)),
      srcStart: Number(s.toFixed(2)),
      srcEnd: Number(e.toFixed(2)),
    };
  };
  const shots: Array<{ tSec: number; srcStart: number; srcEnd: number }> = [];
  const c1 = cleanCands[0];
  if (c1) {
    shots.push(mkShot(c1, B.hookShot1Lead, B.hookShot1Reaction));
    const c2 = cleanCands.find((x) => Math.abs(x.tSec - c1.tSec) >= B.hookMinGapSrcSec);
    if (c2) shots.push(mkShot(c2, B.hookShot2Lead, B.hookShot2Reaction));
  }

  writeFileSync(
    outPath,
    JSON.stringify(
      {
        videoId: id,
        engine: 'paddle-ocr-gate',
        params: {
          CAND_TOP,
          scanFps,
          TITLE_ZONE: [TITLE_GATE.zoneTop, TITLE_GATE.zoneBot],
          TITLE_MIN_W: TITLE_GATE.minW,
          TITLE_MIN_H: TITLE_GATE.minH,
        },
        shots,
        setupSrcStart: Number(setupSrcStart.toFixed(2)),
        rejected,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  rmSync(framesDir, { recursive: true, force: true });

  console.log('======================================================');
  console.log(`[03e] HOOK CLEAN — ${id}`);
  for (const c of cs) {
    const d = (dirtyByCand.get(c.prefix) ?? []).length;
    console.log(`  cú t=${c.tSec}s score=${c.score} → ${d} frame dính title`);
  }
  console.log(
    `  → chọn ${shots.length} hook shot SẠCH: ${shots.map((s) => `[${s.srcStart}-${s.srcEnd}]`).join(' + ')}`,
  );
  console.log(
    `  → setupSrcStart = ${setupSrcStart.toFixed(2)}s ${setupSrcStart > 0 ? `(skip title-card intro src 0→${setupSrcStart.toFixed(2)}s)` : '(không có title intro)'}`,
  );
  if (rejected.length > 0)
    console.log(
      `  loại ${rejected.length} cú: ${rejected.map((r) => `t${r.tSec}(${r.reason})`).join(', ')}`,
    );
  if (shots.length === 0)
    console.log('  ⚠️ KHÔNG có hook sạch → buildStorySegments sẽ bỏ hook (story vào thẳng).');
  console.log('======================================================');
}

main();
