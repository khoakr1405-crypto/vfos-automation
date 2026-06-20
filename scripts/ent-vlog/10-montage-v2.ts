// E1 step 10 — montage v2 with SYNC-FIXED captions.
// Single source of truth: ONE clean Vietnamese VO text → edge voice → caption is
// built FROM that voice's timing (never editorial / never raw ASR/translation).
// Hard audit: hash(voice text) MUST equal hash(caption text) or the build FAILS.
// Hook (0–3s) written from a SINGLE vision call understanding the money-shots.
// Isolation: data/temp/ent only, BGM read-only, no jobs registry, no commit.
//   pnpm tsx scripts/ent-vlog/10-montage-v2.ts --id ent_squid_001
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { requireOpenAIKey, workDir } from './lib/env.js';
import { type AsrSegment, chatJson, chatVisionJson } from './lib/openai.js';
import { EDGE_MALE_VOICE, synthesizeChunk } from './lib/tts-provider.js';

const BGM_LIBRARY = 'production/_media/bgm_library.json';
const DEFAULT_ANCHORS = [3.5, 136.5, 227.5, 290.5, 346.5]; // drop weak 04:15 (255.5)

const VISION_SYS = `Bạn xem các khung hình MONEY-SHOT của 1 video săn mực/câu cá trên biển.
Viết: (1) 1 HOOK 0–3s cực cuốn, ngắn (≤9 từ), ĐÚNG cảnh đang thấy (mực/cá lên, kéo căng…), KHÔNG bịa.
(2) Mô tả CỰC NGẮN mỗi khung (cá/mực gì, đang làm gì).
Trả JSON {"hook":"...","scenes":[{"idx":<number>,"desc":"..."}]}.`;

const NARRATE_SYS = `Bạn viết LỜI THUYẾT MINH tiếng Việt cho montage săn mực, dùng CHUNG cho cả giọng đọc lẫn phụ đề.
Quy tắc: mỗi cú = 1 CÂU NGẮN, đời thường, đúng cảnh đang thấy, năng lượng. KHÔNG lảm nhảm, KHÔNG dịch máy, KHÔNG bịa quá cảnh.
Mỗi câu kết thúc bằng dấu (. ! ?). Trả JSON {"lines":[{"idx":<number>,"vi":"<1 câu>"}]}.`;

interface ReportSeg {
  idx: number;
  tSec: number;
  srcStart: number;
  srcEnd: number;
  dur: number;
  montageStart: number;
}
interface VoLine {
  idx: number;
  text: string;
  montageTime: number;
}
interface Align {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
}

function normHash(s: string): string {
  const n = s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha256').update(n, 'utf8').digest('hex');
}

function tc(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

function pickBgm() {
  const abs = resolve(BGM_LIBRARY);
  if (!existsSync(abs)) return null;
  const lib = JSON.parse(readFileSync(abs, 'utf8')) as { entries?: Array<Record<string, string>> };
  const wf = (lib.entries ?? [])
    .map((e) => ({ e, p: e.localAudioPath ?? e.path ?? '' }))
    .filter((x) => x.p && existsSync(resolve(x.p)));
  if (wf.length === 0) return null;
  const pref =
    wf.find((x) => /lofi|lifestyle|funky|tiktok|upbeat|outdoor/i.test(x.e.mood ?? '')) ?? wf[0];
  return {
    selected: true as const,
    trackId: pref.e.trackId ?? pref.e.id ?? 'bgm',
    title: pref.e.title ?? 'bgm',
    mood: pref.e.mood ?? '',
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

/** Build char alignment for a VO line: chars come from the LINE TEXT (so caption
 *  == voice text), times spread across the line's actual spoken span (edge). */
function alignLine(
  text: string,
  edgeWords: Array<{ offsetSec: number; durationSec: number }>,
  montageTime: number,
): Align {
  const a: Align = { characters: [], characterStartTimesSeconds: [], characterEndTimesSeconds: [] };
  const chars = [...text];
  let t0 = montageTime;
  let t1 = montageTime + Math.max(1.2, chars.length * 0.07);
  if (edgeWords.length > 0) {
    const first = edgeWords[0];
    const last = edgeWords[edgeWords.length - 1];
    if (first && last) {
      t0 = montageTime + first.offsetSec;
      t1 = montageTime + last.offsetSec + last.durationSec;
    }
  }
  const per = chars.length > 0 ? (t1 - t0) / chars.length : 0;
  chars.forEach((c, i) => {
    a.characters.push(c);
    a.characterStartTimesSeconds.push(t0 + i * per);
    a.characterEndTimesSeconds.push(t0 + (i + 1) * per);
  });
  // separator space so adjacent lines never glue ("tay!Lên").
  a.characters.push(' ');
  a.characterStartTimesSeconds.push(t1);
  a.characterEndTimesSeconds.push(t1);
  return a;
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
    console.error('Usage: --id <slug>');
    process.exit(1);
  }
  const lead = values.lead ? Number(values.lead) : 14;
  const reaction = values.reaction ? Number(values.reaction) : 9;
  const anchorsIn = values.anchors
    ? values.anchors.split(',').map((x) => Number(x.trim()))
    : DEFAULT_ANCHORS;

  const dir = workDir(id);
  const meta = JSON.parse(readFileSync(join(dir, 'source_meta.json'), 'utf8')) as {
    path: string;
    durationSec: number;
  };
  const asr = JSON.parse(readFileSync(join(dir, 'asr_zh.json'), 'utf8')) as {
    segments: AsrSegment[];
  };
  const catchData = JSON.parse(readFileSync(join(dir, 'catch_moments.json'), 'utf8')) as {
    moments: Array<{ tSec: number; what: string }>;
  };
  const apiKey = requireOpenAIKey();

  // Segments anchored on money-shots.
  let running = 0;
  const segs: ReportSeg[] = anchorsIn
    .sort((a, b) => a - b)
    .map((tSec, idx) => {
      const srcStart = Math.max(0, tSec - lead);
      const srcEnd = Math.min(meta.durationSec, tSec + reaction);
      const dur = srcEnd - srcStart;
      const montageStart = running;
      running += dur;
      return { idx, tSec, srcStart, srcEnd, dur, montageStart };
    });
  const montageTotal = running;
  const moneyShotMontage = (s: ReportSeg) => s.montageStart + (s.tSec - s.srcStart);

  const clipDir = join(dir, 'montage_v2');
  const segDir = join(clipDir, 'segs');
  mkdirSync(segDir, { recursive: true });

  // 1) Cut + concat (video only).
  console.log(`[10] Cắt ${segs.length} đoạn (bỏ cú yếu 04:15)…`);
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
        `CUT_${s.idx}`,
      )
    )
      process.exit(3);
    segFiles.push(fp);
  }
  const montageMp4 = join(clipDir, 'montage.mp4');
  if (
    !sh(
      'ffmpeg',
      [
        '-y',
        ...segFiles.flatMap((f) => ['-i', f]),
        '-filter_complex',
        `${segFiles.map((_, i) => `[${i}:v]`).join('')}concat=n=${segFiles.length}:v=1:a=0[v]`,
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
      'CONCAT',
    )
  )
    process.exit(3);

  // 2) VO TEXT (single source for voice + caption). Cached in vo_text.json so
  // re-runs do NOT repeat the vision/gpt-4o calls (operator: 1 vision call only).
  const voTextPath = join(clipDir, 'vo_text.json');
  let hook: string;
  let voLines: VoLine[];
  if (existsSync(voTextPath)) {
    const cached = JSON.parse(readFileSync(voTextPath, 'utf8')) as {
      hook: string;
      lines: VoLine[];
    };
    hook = cached.hook;
    voLines = cached.lines;
    console.log('[10] Reuse vo_text.json (skip vision + gpt-4o) — giữ 1 vision call.');
  } else {
    // ONE vision call: extract 1 money-shot frame per segment → hook + scenes.
    const visDir = join(clipDir, '_vis');
    mkdirSync(visDir, { recursive: true });
    const visImgs: Array<{ label: string; base64: string }> = [];
    for (const s of segs) {
      const fp = join(visDir, `ms_${s.idx}.jpg`);
      spawnSync(
        'ffmpeg',
        [
          '-y',
          '-ss',
          String(s.tSec),
          '-i',
          meta.path,
          '-frames:v',
          '1',
          '-vf',
          'scale=512:-1',
          '-q:v',
          '5',
          fp,
        ],
        { encoding: 'utf8' },
      );
      if (existsSync(fp))
        visImgs.push({ label: `idx=${s.idx}`, base64: readFileSync(fp).toString('base64') });
    }
    console.log(`[10] Vision (1 call) hiểu ${visImgs.length} money-shot + viết hook…`);
    const vis = await chatVisionJson<{
      hook?: string;
      scenes?: Array<{ idx: number; desc: string }>;
    }>(apiKey, {
      system: VISION_SYS,
      userText: 'Các khung money-shot (theo idx). Viết hook + mô tả từng cảnh.',
      images: visImgs,
    });
    hook = (vis.hook ?? 'Đi câu kiểu này mới gọi là đã!').trim();
    const sceneDesc = new Map((vis.scenes ?? []).map((x) => [x.idx, x.desc]));

    // 3) ONE gpt-4o text call: clean short narration per CATCH segment (idx>=1).
    const catchSegs = segs.filter((s) => s.idx >= 1);
    const asrFor = (s: ReportSeg) =>
      asr.segments
        .filter((a) => a.end > s.srcStart && a.start < s.srcEnd && a.text.trim())
        .map((a) => a.text.trim())
        .join(' ');
    console.log('[10] gpt-4o viết lại VO sạch (1 câu/cú)…');
    const nar = await chatJson<{ lines?: Array<{ idx: number; vi: string }> }>(apiKey, {
      system: NARRATE_SYS,
      user: [
        'Bối cảnh: montage săn mực Biển Đông.',
        ...catchSegs.map(
          (s) =>
            `idx=${s.idx} | cảnh(vision): ${sceneDesc.get(s.idx) ?? 'mực/cá lên'} | lời gốc(ASR): ${asrFor(s) || '(ít/không lời)'}`,
        ),
      ].join('\n'),
      temperature: 0.6,
    });
    const lineByIdx = new Map((nar.lines ?? []).map((l) => [l.idx, l.vi.trim()]));

    // 4) Build VO lines (single source). idx 0 = hook; catches = clean narration.
    voLines = [];
    for (const s of segs) {
      const text = s.idx === 0 ? hook : lineByIdx.get(s.idx) || 'Lên rồi, con này ngon!';
      const mt =
        s.idx === 0
          ? s.montageStart + 0.3
          : Math.max(s.montageStart + 0.5, moneyShotMontage(s) - 2.0);
      voLines.push({ idx: s.idx, text, montageTime: Number(mt.toFixed(2)) });
    }
    voLines.sort((a, b) => a.montageTime - b.montageTime);
    writeFileSync(voTextPath, JSON.stringify({ hook, lines: voLines }, null, 2));
  }

  // 5) Synthesize VO (edge) + build caption timing FROM the VO text.
  const tmp = join(clipDir, '_tts');
  mkdirSync(tmp, { recursive: true });
  const align: Align = {
    characters: [],
    characterStartTimesSeconds: [],
    characterEndTimesSeconds: [],
  };
  const voMp3: string[] = [];
  const delays: number[] = [];
  console.log(`[10] Edge-tts ${voLines.length} câu + build caption timing từ chính VO…`);
  for (const l of voLines) {
    const outAudio = join(tmp, `vo_${l.idx}.mp3`);
    const outWords = join(tmp, `vo_${l.idx}.words.json`);
    const words = synthesizeChunk('edge', {
      text: l.text,
      voice: EDGE_MALE_VOICE,
      outAudio,
      outWords,
    });
    if (!existsSync(outAudio)) continue;
    voMp3.push(outAudio);
    delays.push(Math.round(l.montageTime * 1000));
    const la = alignLine(l.text, words, l.montageTime);
    align.characters.push(...la.characters);
    align.characterStartTimesSeconds.push(...la.characterStartTimesSeconds);
    align.characterEndTimesSeconds.push(...la.characterEndTimesSeconds);
  }
  if (voMp3.length === 0) {
    console.error('🛑 NO_VOICE_SYNTH');
    process.exit(4);
  }
  const voOut = join(clipDir, 'montage_vo.mp3');
  // apad pads silence after the last line so the VO track equals the full
  // montage length (-t trims to exact) — otherwise -shortest in the renderer
  // would cut the tail (truncating the last money-shot reaction).
  const filter =
    voMp3.length === 1
      ? `[0:a]adelay=${delays[0]}:all=1,apad[out]`
      : `${voMp3.map((_, i) => `[${i}:a]adelay=${delays[i]}:all=1[a${i}]`).join(';')};${voMp3.map((_, i) => `[a${i}]`).join('')}amix=inputs=${voMp3.length}:normalize=0:dropout_transition=0,apad[out]`;
  if (
    !sh(
      'ffmpeg',
      [
        '-y',
        ...voMp3.flatMap((p) => ['-i', p]),
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
      'VO_MIX',
    )
  )
    process.exit(4);

  const timingPath = join(clipDir, 'voice_timing_artifact.json');
  writeFileSync(
    timingPath,
    JSON.stringify(
      {
        timingVersion: 'ent-v2',
        runId: `ent_${id}_montage_v2`,
        alignment: align,
        captionReady: true,
      },
      null,
      2,
    ),
  );

  // 6) HASH AUDIT: voice text (single source) vs caption text (read back from timing).
  const voiceSourceText = voLines.map((l) => l.text).join(' ');
  const captionText = (
    JSON.parse(readFileSync(timingPath, 'utf8')) as { alignment: Align }
  ).alignment.characters.join('');
  const voiceHash = normHash(voiceSourceText);
  const captionHash = normHash(captionText);
  const hashMatch = voiceHash === captionHash;
  console.log(`[10] HASH AUDIT voice==caption: ${hashMatch ? '✅ MATCH' : '❌ MISMATCH'}`);
  if (!hashMatch) {
    console.error('🛑 SYNC_AUDIT_FAILED — caption text khác voice text. KHÔNG xuất success giả.');
    console.error(`   voiceHash=${voiceHash.slice(0, 16)} captionHash=${captionHash.slice(0, 16)}`);
    process.exit(7);
  }

  // 7) Real pipeline: scrub (whole-frame) → render(voice+BGM) → caption(viral, voice timing).
  const maskPath = join(clipDir, 'source_subtitle_mask.json');
  console.log('[10] Scrub chữ Hán toàn khung…');
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
    'SCRUB',
    true,
  );
  const bgm = pickBgm();
  const renderDir = join(clipDir, 'render');
  mkdirSync(renderDir, { recursive: true });
  const rmPath = join(renderDir, 'render_manifest.json');
  writeFileSync(
    rmPath,
    JSON.stringify(
      {
        renderVersion: 'v1',
        jobId: `ent_${id}_montage_v2`,
        runId: `ent_${id}_montage_v2`,
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
  console.log('[10] Render thật (voice + BGM)…');
  if (
    !sh(
      'npx',
      [
        'tsx',
        'scripts/offline-render-video-demo.ts',
        '--render',
        rmPath,
        '--output',
        join(renderDir, 'preview_artifact.json'),
        '--mode',
        'local-preview',
        '--input-video',
        montageMp4,
        '--input-audio',
        voOut,
      ],
      'RENDER',
      true,
    )
  )
    process.exit(5);
  const previewMp4 = join(renderDir, 'preview.mp4');
  if (!existsSync(previewMp4)) {
    console.error('🛑 RENDER_NO_OUTPUT');
    process.exit(5);
  }
  const runId = `ent_${id}_montage_v2`;
  mkdirSync(resolve('data/temp/pipeline-p9-demo', runId), { recursive: true });
  const shortOut = join(dir, 'montage_v2_short.mp4');
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
  console.log('[10] Caption từ VOICE timing (viral_review_v2 + delogo)…');
  if (!sh('npx', capArgs, 'CAPTION', true)) process.exit(6);

  // 8) QA probe + scrub honesty check.
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
  let maskSegN = 0;
  try {
    maskSegN =
      (JSON.parse(readFileSync(maskPath, 'utf8')) as { segments?: unknown[] }).segments?.length ??
      0;
  } catch {
    /* ignore */
  }

  const report = {
    hook,
    voTextPath,
    voicePath: voOut,
    timingPath,
    voiceHash: voiceHash.slice(0, 16),
    captionHash: captionHash.slice(0, 16),
    hashMatch,
    output: shortOut,
    totalDurationSec: Number(montageTotal.toFixed(1)),
    outputDurationSec: Number(outDur.toFixed(1)),
    hasAudio,
    moneyShots: segs.map((s) => ({
      anchor: tc(s.tSec),
      montage: tc(moneyShotMontage(s)),
      inside: s.tSec >= s.srcStart && s.tSec <= s.srcEnd,
    })),
    scrubApplied: scrubOk,
    scrubMaskSegments: maskSegN,
    bgm: bgm?.trackId ?? null,
    voLines: voLines.map((l) => ({ at: tc(l.montageTime), text: l.text })),
  };
  writeFileSync(join(clipDir, 'montage_v2_report.json'), JSON.stringify(report, null, 2));

  console.log('======================================================');
  console.log(`[10] ✅ MONTAGE v2 — sync audit ${hashMatch ? 'PASS' : 'FAIL'}`);
  console.log(`   HOOK: ${hook}`);
  for (const l of report.voLines) console.log(`   ${l.at} | ${l.text}`);
  console.log(
    `   TỔNG ${report.totalDurationSec}s (out ${report.outputDurationSec}s, audio ${hasAudio ? '✅' : '❌'})`,
  );
  console.log(`   scrub: ${scrubOk ? `✅ (${maskSegN} vùng)` : '⚠'} | BGM: ${bgm?.trackId ?? '⚠'}`);
  console.log(`   OUTPUT: ${shortOut}`);
  console.log('======================================================');
}

main().catch((e) => {
  console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
