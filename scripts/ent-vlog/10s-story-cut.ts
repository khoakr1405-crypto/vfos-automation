// E1 step 10s — STORY CUT (R2, VIDEO-ONLY). Cắt source theo MẠCH CHUYỆN (buildStorySegments)
// để soi mắt thường: setup → buildup → escalation → climax → resolution.
// CHỈ cắt + nối video (giữ audio gốc passthrough để xem). KHÔNG VO, KHÔNG caption,
// KHÔNG Demucs/ambient, KHÔNG gọi LLM, KHÔNG đụng 10/12/13/15/20/anchors.
//   pnpm tsx scripts/ent-vlog/10s-story-cut.ts --id ent_fishing_20260626_232632
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { workDir } from './lib/env.js';
import { buildStorySegments } from './lib/story-arc.js';

function sh(args: string[], label: string): boolean {
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8', stdio: 'pipe' });
  if (r.status !== 0) {
    console.error(`⚠️ ${label} (exit ${r.status ?? 'null'})`);
    console.error((r.stderr ?? '').slice(-600));
    return false;
  }
  return true;
}

function main(): void {
  const { values } = parseArgs({ options: { id: { type: 'string' } }, strict: true });
  const id = values.id;
  if (!id) {
    console.error('Usage: --id <ent_job_id>');
    process.exit(1);
  }
  const dir = workDir(id);
  for (const f of ['source_meta.json', 'asr_zh.json', 'catch_moments.json']) {
    if (!existsSync(join(dir, f))) {
      console.error(`🛑 MISSING ${f} — cần analyze (02/03b) trước.`);
      process.exit(2);
    }
  }
  const meta = JSON.parse(readFileSync(join(dir, 'source_meta.json'), 'utf8')) as { path: string };
  const src = meta.path;

  const build = buildStorySegments(dir, id);
  console.log(`[10s] ${id} | type ${build.source_type} | confidence ${build.story_confidence}`);
  if (build.segs.length === 0) {
    console.log(`[10s] ${build.note ?? 'Không có story segs.'} — KHÔNG cắt.`);
    process.exit(0);
  }

  const outDir = join(dir, 'story_cut');
  const segDir = join(outDir, 'segs');
  mkdirSync(segDir, { recursive: true });

  console.log(`[10s] Cắt ${build.segs.length} đoạn theo act (video-only, audio gốc passthrough)…`);
  const segFiles: string[] = [];
  for (const s of build.segs) {
    const fp = join(segDir, `s_${s.idx}_${s.role}.mp4`);
    if (
      !sh(
        [
          '-y',
          '-ss',
          String(s.srcStart),
          '-i',
          src,
          '-t',
          String(s.dur),
          '-vf',
          'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1',
          '-r',
          '30',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '22',
          '-c:a',
          'aac',
          '-ar',
          '44100',
          '-ac',
          '2',
          fp,
        ],
        `CUT_${s.idx}`,
      )
    )
      process.exit(3);
    segFiles.push(fp);
  }

  const outMp4 = join(dir, 'montage_story_preview.mp4');
  const inputs = segFiles.flatMap((f) => ['-i', f]);
  const filt = `${segFiles.map((_, i) => `[${i}:v][${i}:a]`).join('')}concat=n=${segFiles.length}:v=1:a=1[v][a]`;
  if (
    !sh(
      [
        '-y',
        ...inputs,
        '-filter_complex',
        filt,
        '-map',
        '[v]',
        '-map',
        '[a]',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '22',
        '-c:a',
        'aac',
        outMp4,
      ],
      'CONCAT',
    )
  )
    process.exit(3);

  const report = {
    videoId: id,
    engine: 'story-cut-r2-video-only',
    source_type: build.source_type,
    story_confidence: build.story_confidence,
    montageTotalSec: build.montageTotalSec,
    output: outMp4,
    note: 'VIDEO-ONLY: audio gốc passthrough, CHƯA VO/caption/Demucs/ambient.',
    segs: build.segs.map((s) => ({
      role: s.role,
      montage: `${s.montageStart.toFixed(1)}-${(s.montageStart + s.dur).toFixed(1)}s`,
      source: `${s.srcStart.toFixed(1)}-${s.srcEnd.toFixed(1)}s`,
      moment: s.tSec,
    })),
  };
  writeFileSync(join(dir, 'story_segments.json'), JSON.stringify(report, null, 2));

  console.log('======================================================');
  console.log(`[10s] ✅ STORY CUT (video-only) — ${build.montageTotalSec}s`);
  for (const s of report.segs)
    console.log(`  ${s.role.padEnd(11)} mont[${s.montage}] src[${s.source}] @${s.moment}`);
  console.log(`  OUTPUT: ${outMp4}`);
  console.log('  (audio gốc passthrough · CHƯA VO/caption/ambient — chỉ kiểm cấu trúc)');
  console.log('======================================================');
}

main();
