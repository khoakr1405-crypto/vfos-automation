// E1 step 08 — VISION-ANCHORED condensed montage. Builds ONE tight video from
// the real catch money-shots (03b), NOT transcript guesses. Each segment is
// anchored on a money-shot: lead-up before + reaction after. Vietnamese VO is
// reused from the source ASR/translation per segment (short scene line if a
// segment is silent). Then the REAL isolated pipeline renders it:
//   scrub (whole-frame) → offline-render (voice+BGM) → kinetic caption (viral).
// Isolation: nothing under data/temp/jobs/, BGM read-only, no registry/commit.
//   pnpm tsx scripts/ent-vlog/08-montage.ts --id ent_squid_001 [--anchors 136.5,227.5,290.5,346.5] [--lead 12] [--reaction 8]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { requireOpenAIKey, workDir } from './lib/env.js';
import type { AsrSegment } from './lib/openai.js';
import { chatJson } from './lib/openai.js';
import { type ClipSeg, transcreateClip } from './lib/transcreation.js';
import {
  type CharAlign,
  EDGE_MALE_VOICE,
  synthesizeChunk,
  wordsToCharAlign,
} from './lib/tts-provider.js';

const BGM_LIBRARY = 'production/_media/bgm_library.json';
const CONTEXT =
  'Vlog câu/săn mực trên biển (Biển Đông), giọng nam vui vẻ, montage nhiều cú lên mực.';

interface BgmEntry {
  trackId?: string;
  id?: string;
  title?: string;
  mood?: string;
  path?: string;
  localAudioPath?: string;
}

function pickBgmReadOnly() {
  const abs = resolve(BGM_LIBRARY);
  if (!existsSync(abs)) return null;
  const lib = JSON.parse(readFileSync(abs, 'utf8')) as { entries?: BgmEntry[] };
  const withFile = (lib.entries ?? [])
    .map((e) => ({ e, p: e.localAudioPath ?? e.path ?? null }))
    .filter((x): x is { e: BgmEntry; p: string } => !!x.p && existsSync(resolve(x.p)));
  if (withFile.length === 0) return null;
  const pref =
    withFile.find((x) => /lofi|lifestyle|funky|tiktok|upbeat|outdoor/i.test(x.e.mood ?? '')) ??
    withFile[0];
  return {
    selected: true as const,
    trackId: pref.e.trackId ?? pref.e.id ?? 'bgm',
    title: pref.e.title ?? 'bgm',
    mood: pref.e.mood ?? 'unknown',
    localAudioPath: resolve(pref.p),
    volumeMultiplier: 0.4,
  };
}

function sh(cmd: string, args: string[], label: string, useShell = false): boolean {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: useShell, stdio: 'pipe' });
  if (r.status !== 0) {
    console.error(`⚠️ ${label} (exit ${r.status ?? 'null'})`);
    console.error((r.stdout ?? '').slice(-400));
    console.error((r.stderr ?? '').slice(-700));
    return false;
  }
  return true;
}

function tc(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      id: { type: 'string' },
      anchors: { type: 'string' },
      lead: { type: 'string' },
      reaction: { type: 'string' },
    },
    strict: true,
  });
  const id = values.id;
  if (!id) {
    console.error('Usage: --id <slug> [--anchors a,b,c] [--lead 12] [--reaction 8]');
    process.exit(1);
  }
  const lead = values.lead ? Number(values.lead) : 12;
  const reaction = values.reaction ? Number(values.reaction) : 8;

  const dir = workDir(id);
  const metaPath = join(dir, 'source_meta.json');
  const asrPath = join(dir, 'asr_zh.json');
  const catchPath = join(dir, 'catch_moments.json');
  for (const [p, n] of [
    [metaPath, 'source_meta.json (01)'],
    [asrPath, 'asr_zh.json (02)'],
    [catchPath, 'catch_moments.json (03b)'],
  ] as const) {
    if (!existsSync(p)) {
      console.error(`🛑 Thiếu ${n}.`);
      process.exit(1);
    }
  }
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { path: string; durationSec: number };
  const asr = JSON.parse(readFileSync(asrPath, 'utf8')) as { segments: AsrSegment[] };
  const catchData = JSON.parse(readFileSync(catchPath, 'utf8')) as {
    moments: Array<{ tSec: number; score: number; what: string }>;
  };

  // Resolve anchors: explicit list, else moments with t>=10 & score>=8 (skips intro/weak).
  let anchors: Array<{ tSec: number; what: string }>;
  if (values.anchors) {
    const wanted = values.anchors.split(',').map((x) => Number(x.trim()));
    anchors = wanted.map(
      (t) =>
        catchData.moments.find((m) => Math.abs(m.tSec - t) < 0.6) ?? {
          tSec: t,
          score: 0,
          what: '',
        },
    );
  } else {
    anchors = catchData.moments
      .filter((m) => m.tSec >= 10 && m.score >= 8)
      .map((m) => ({ tSec: m.tSec, what: m.what }));
  }
  anchors.sort((a, b) => a.tSec - b.tSec);
  if (anchors.length === 0) {
    console.error('🛑 Không có anchor nào (chạy 03b hoặc truyền --anchors).');
    process.exit(2);
  }

  // Build segments anchored on each money-shot; compute montage offsets.
  let running = 0;
  const segs = anchors.map((a, i) => {
    const srcStart = Math.max(0, a.tSec - lead);
    const srcEnd = Math.min(meta.durationSec, a.tSec + reaction);
    const dur = srcEnd - srcStart;
    const montageStart = running;
    running += dur;
    return { idx: i, tSec: a.tSec, what: a.what, srcStart, srcEnd, dur, montageStart };
  });
  const montageTotal = running;

  const clipDir = join(dir, 'montage');
  const segDir = join(clipDir, 'segs');
  mkdirSync(segDir, { recursive: true });

  // 1) Cut each segment (video only, uniform encode) then concat.
  console.log(`[08] Cắt ${segs.length} đoạn neo money-shot…`);
  const segFiles: string[] = [];
  for (const s of segs) {
    const fp = join(segDir, `seg_${s.idx}.mp4`);
    if (
      !sh(
        'ffmpeg',
        [
          '-y',
          '-ss',
          String(s.srcStart),
          '-i',
          meta.path,
          '-t',
          String(s.dur),
          '-an',
          '-r',
          '30',
          '-vf',
          'scale=720:1280',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '20',
          fp,
        ],
        `CUT_${s.idx}_FAILED`,
      )
    )
      process.exit(3);
    segFiles.push(fp);
  }
  const montageMp4 = join(clipDir, 'montage.mp4');
  const concatInputs = segFiles.flatMap((f) => ['-i', f]);
  const concatFilter = `${segFiles.map((_, i) => `[${i}:v]`).join('')}concat=n=${segFiles.length}:v=1:a=0[v]`;
  console.log('[08] Ghép montage (concat)…');
  if (
    !sh(
      'ffmpeg',
      [
        '-y',
        ...concatInputs,
        '-filter_complex',
        concatFilter,
        '-map',
        '[v]',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        montageMp4,
      ],
      'CONCAT_FAILED',
    )
  )
    process.exit(3);

  // 2) Gather ASR speech overlapping each segment → montage-timeline ClipSegs.
  const apiKey = requireOpenAIKey();
  const clipSegs: ClipSeg[] = [];
  let nextId = 1;
  for (const s of segs) {
    for (const a of asr.segments) {
      const ov0 = Math.max(a.start, s.srcStart);
      const ov1 = Math.min(a.end, s.srcEnd);
      if (ov1 - ov0 < 0.4 || !a.text.trim()) continue;
      const montageStart = s.montageStart + (ov0 - s.srcStart);
      const montageEnd = s.montageStart + (ov1 - s.srcStart);
      clipSegs.push({
        id: nextId++,
        start: Number(montageStart.toFixed(2)),
        end: Number(montageEnd.toFixed(2)),
        zh: a.text.trim(),
      });
    }
  }

  // 3) Translate the real speech (montage-timed) via the 2-pass transcreation.
  let translated: Array<{ id: number; start: number; end: number; vi: string }> = [];
  if (clipSegs.length > 0) {
    console.log(`[08] Dịch ${clipSegs.length} đoạn thoại (montage-timed)…`);
    const r = await transcreateClip(apiKey, { segments: clipSegs, contextVi: CONTEXT });
    translated = r.segments.map((x) => ({ id: x.id, start: x.start, end: x.end, vi: x.vi }));
  }

  // 3b) Any segment with NO speech → short scene VO line (allowed, not over-fabricated).
  for (const s of segs) {
    const has = translated.some(
      (t) => t.start >= s.montageStart - 0.1 && t.start < s.montageStart + s.dur,
    );
    if (!has) {
      console.log(`[08] Đoạn ${s.idx} không có thoại → viết 1 câu reo ngắn theo cảnh…`);
      let vi = 'Lên rồi anh em ơi!';
      try {
        const g = await chatJson<{ vi?: string }>(apiKey, {
          system:
            'Viết DUY NHẤT 1 câu reo tiếng Việt ≤10 từ khi vừa câu được cá/mực, tự nhiên kiểu vlog, KHÔNG bịa số liệu/sự kiện. Trả JSON {"vi":"..."}.',
          user: `Cảnh: ${s.what || 'vừa câu được mực/cá, đang giơ lên'}`,
          temperature: 0.7,
        });
        if (g.vi?.trim()) vi = g.vi.trim();
      } catch {
        /* fallback template */
      }
      translated.push({
        id: nextId++,
        start: Number((s.montageStart + lead).toFixed(2)),
        end: Number((s.montageStart + lead + 2).toFixed(2)),
        vi,
      });
    }
  }
  translated.sort((a, b) => a.start - b.start);

  // 4) Synthesize per-segment VO (edge male), timed to montage, + char align.
  const tmp = join(clipDir, '_tts');
  mkdirSync(tmp, { recursive: true });
  const segMp3: string[] = [];
  const delaysMs: number[] = [];
  const align: CharAlign = {
    characters: [],
    characterStartTimesSeconds: [],
    characterEndTimesSeconds: [],
  };
  console.log(`[08] Lồng tiếng ${translated.length} đoạn (edge Nam, bám timing montage)…`);
  for (const t of translated) {
    if (!t.vi.trim()) continue;
    const outAudio = join(tmp, `vo_${t.id}.mp3`);
    const outWords = join(tmp, `vo_${t.id}.words.json`);
    const words = synthesizeChunk('edge', {
      text: t.vi,
      voice: EDGE_MALE_VOICE,
      outAudio,
      outWords,
    });
    if (!existsSync(outAudio)) continue;
    segMp3.push(outAudio);
    delaysMs.push(Math.round(Math.max(0, t.start) * 1000));
    const a = wordsToCharAlign(words, Math.max(0, t.start));
    align.characters.push(...a.characters);
    align.characterStartTimesSeconds.push(...a.characterStartTimesSeconds);
    align.characterEndTimesSeconds.push(...a.characterEndTimesSeconds);
  }
  const voOut = join(clipDir, 'montage_vo.mp3');
  if (segMp3.length > 0) {
    const inputs = segMp3.flatMap((p) => ['-i', p]);
    const filter =
      segMp3.length === 1
        ? `[0:a]adelay=${delaysMs[0]}:all=1[out]`
        : `${segMp3.map((_, i) => `[${i}:a]adelay=${delaysMs[i]}:all=1[a${i}]`).join(';')};${segMp3.map((_, i) => `[a${i}]`).join('')}amix=inputs=${segMp3.length}:normalize=0:dropout_transition=0[out]`;
    if (
      !sh(
        'ffmpeg',
        [
          '-y',
          ...inputs,
          '-filter_complex',
          filter,
          '-map',
          '[out]',
          '-t',
          montageTotal.toFixed(2),
          '-ar',
          '44100',
          '-ac',
          '2',
          voOut,
        ],
        'VO_FAILED',
      )
    )
      process.exit(4);
  }
  const timingPath = join(clipDir, 'montage_timing.json');
  writeFileSync(
    timingPath,
    JSON.stringify(
      {
        timingVersion: 'ent-montage-v1',
        runId: `ent_${id}_montage`,
        alignment: align,
        captionReady: true,
      },
      null,
      2,
    ),
  );

  // 5) REAL pipeline (isolated): scrub whole-frame → render(voice+BGM) → caption viral + delogo.
  const maskPath = join(clipDir, 'source_subtitle_mask.json');
  console.log('[08] Scrub chữ Hán toàn khung (real module)…');
  const scrubOk = sh(
    'npx',
    [
      'tsx',
      'scripts/source-subtitle-detector.ts',
      '--input',
      montageMp4,
      '--output',
      maskPath,
      '--zone-top',
      '0.0',
      '--zone-bottom',
      '1.0',
    ],
    'SCRUB_SKIPPED',
    true,
  );

  const bgm = pickBgmReadOnly();
  const renderDir = join(clipDir, 'render');
  mkdirSync(renderDir, { recursive: true });
  const renderManifestPath = join(renderDir, 'render_manifest.json');
  writeFileSync(
    renderManifestPath,
    JSON.stringify(
      {
        renderVersion: 'v1',
        jobId: `ent_${id}_montage`,
        runId: `ent_${id}_montage`,
        output: { expectedPreviewPath: join(renderDir, 'preview.mp4') },
        renderOptions: {
          estimatedDurationSec: Math.round(montageTotal),
          resolution: '720x1280',
          aspectRatio: '9:16',
        },
        assets: { bgm },
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log('[08] Render thật (voice + BGM mix)…');
  if (
    !sh(
      'npx',
      [
        'tsx',
        'scripts/offline-render-video-demo.ts',
        '--render',
        renderManifestPath,
        '--output',
        join(renderDir, 'preview_artifact.json'),
        '--mode',
        'local-preview',
        '--input-video',
        montageMp4,
        '--input-audio',
        voOut,
      ],
      'RENDER_FAILED',
      true,
    )
  )
    process.exit(5);
  const previewMp4 = join(renderDir, 'preview.mp4');
  if (!existsSync(previewMp4)) {
    console.error('🛑 RENDER_NO_OUTPUT');
    process.exit(5);
  }

  const runId = `ent_${id}_montage`;
  mkdirSync(resolve('data/temp/pipeline-p9-demo', runId), { recursive: true });
  const shortOut = join(dir, 'montage_short.mp4');
  const capArgs = [
    'tsx',
    'scripts/kinetic-caption-renderer.ts',
    '--run',
    runId,
    '--preset',
    'viral_review_v2',
    '--timing',
    timingPath,
    '--input',
    previewMp4,
    '--output',
    shortOut,
  ];
  if (scrubOk && existsSync(maskPath))
    capArgs.push('--subtitle-mask', maskPath, '--cover-mode', 'delogo');
  console.log('[08] Caption Việt (viral_review_v2) + che chữ Hán…');
  if (!sh('npx', capArgs, 'CAPTION_FAILED', true)) process.exit(6);

  // 6) Report data.
  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', shortOut],
    { encoding: 'utf8' },
  );
  let outDur = 0;
  let hasAudio = false;
  try {
    const j = JSON.parse(probe.stdout) as {
      format?: { duration?: string };
      streams?: Array<{ codec_type?: string }>;
    };
    outDur = Number.parseFloat(j.format?.duration ?? '0');
    hasAudio = (j.streams ?? []).some((s) => s.codec_type === 'audio');
  } catch {
    /* ignore */
  }

  const report = {
    segments: segs.map((s) => ({
      anchor: tc(s.tSec),
      srcStart: Number(s.srcStart.toFixed(1)),
      srcEnd: Number(s.srcEnd.toFixed(1)),
      durationSec: Number(s.dur.toFixed(1)),
      montageStart: Number(s.montageStart.toFixed(1)),
      moneyShotInside: s.tSec >= s.srcStart && s.tSec <= s.srcEnd,
    })),
    montageTotalSec: Number(montageTotal.toFixed(1)),
    outputDurationSec: Number(outDur.toFixed(1)),
    hasAudio,
    scrubApplied: scrubOk,
    bgm: bgm ? bgm.trackId : null,
    voiceCount: segMp3.length,
    output: shortOut,
  };
  writeFileSync(join(clipDir, 'montage_report.json'), JSON.stringify(report, null, 2));

  console.log('======================================================');
  console.log('[08] ✅ MONTAGE xong:');
  for (const s of report.segments)
    console.log(
      `   anchor ${s.anchor} | src ${s.srcStart}-${s.srcEnd}s (${s.durationSec}s) | montage@${s.montageStart}s | money-shot inside: ${s.moneyShotInside ? '✅' : '❌'}`,
    );
  console.log(
    `   TỔNG: ${report.montageTotalSec}s (output ${report.outputDurationSec}s, audio ${hasAudio ? '✅' : '❌'})`,
  );
  console.log(
    `   scrub: ${scrubOk ? '✅' : '⚠'} | BGM: ${bgm ? bgm.trackId : '⚠ none'} | VO đoạn: ${segMp3.length}`,
  );
  console.log(`   OUTPUT: ${shortOut}`);
  console.log('======================================================');
}

main().catch((e) => {
  console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
