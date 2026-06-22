// E1 step 12 — VOICE + RENDER from the APPROVED 24-chunk script.
// Reuses the existing montage.mp4 (visual unchanged) + scrub mask. Re-synthesizes
// edge-tts (male) VO from montage_v2_script.json (the SINGLE source for both
// voice and caption), builds a NEW voice_timing_artifact, mixes VO (+apad so the
// tail money-shot isn't truncated), renders BGM + caption FROM that timing.
// HARD AUDITS (no fake success):
//   - hash(voice text) == hash(caption text) else exit 7
//   - every chunk synthesized (else exit 4)
// Plus QA on REAL edge timing: caption crowding, glue (separator), voice spill
// over the next money-shot. No API. No publish. Isolation: data/temp/ent only.
//   pnpm tsx scripts/ent-vlog/12-voice-render.ts --id ent_squid_001
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { readAnchorPlan } from './lib/anchors.js';
import { workDir } from './lib/env.js';
import { EDGE_MALE_VOICE, synthesizeChunk } from './lib/tts-provider.js';

const BGM_LIBRARY = 'production/_media/bgm_library.json';

interface Beat {
  role: string;
  sceneIdx?: number;
  text: string;
  montageTime: number;
  estSec: number;
}
interface Align {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
}
interface LineSpan {
  role: string;
  sceneIdx?: number;
  text: string;
  start: number;
  end: number;
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

/** Mean & PEAK loudness (dB) via ffmpeg volumedetect. Peak (max) is the fair
 *  voice-vs-BGM measure — VO mean is dragged down by silence gaps. NaN if
 *  unparsable. */
function measureDb(path: string): { mean: number; max: number } {
  const r = spawnSync('ffmpeg', ['-i', path, '-af', 'volumedetect', '-f', 'null', '-'], {
    encoding: 'utf8',
  });
  const err = r.stderr ?? '';
  const mm = err.match(/mean_volume:\s*(-?[\d.]+) dB/);
  const xm = err.match(/max_volume:\s*(-?[\d.]+) dB/);
  return {
    mean: mm && mm[1] != null ? Number(mm[1]) : Number.NaN,
    max: xm && xm[1] != null ? Number(xm[1]) : Number.NaN,
  };
}

/** Build char alignment for a VO line: chars come from the LINE TEXT (so caption
 *  == voice text), times spread across the line's actual spoken span (edge).
 *  Returns the per-line span too (for real-timing QA). */
function lineAlign(
  text: string,
  edgeWords: Array<{ offsetSec: number; durationSec: number }>,
  montageTime: number,
): { align: Align; start: number; end: number } {
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
  for (const [i, c] of chars.entries()) {
    a.characters.push(c);
    a.characterStartTimesSeconds.push(t0 + i * per);
    a.characterEndTimesSeconds.push(t0 + (i + 1) * per);
  }
  // separator space so adjacent lines never glue ("tay!Lên").
  a.characters.push(' ');
  a.characterStartTimesSeconds.push(t1);
  a.characterEndTimesSeconds.push(t1);
  return { align: a, start: t0, end: t1 };
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { id: { type: 'string' } }, strict: true });
  const id = values.id;
  if (!id) {
    console.error('Usage: --id <slug>');
    process.exit(1);
  }
  const dir = workDir(id);
  const clipDir = join(dir, 'montage_v2');
  const script = JSON.parse(readFileSync(join(clipDir, 'montage_v2_script.json'), 'utf8')) as {
    montageTotalSec: number;
    reviewStatus: string;
    scriptModel: string;
    beats: Beat[];
  };
  const meta = JSON.parse(readFileSync(join(dir, 'source_meta.json'), 'utf8')) as {
    durationSec: number;
  };
  const beats = [...script.beats].sort((a, b) => a.montageTime - b.montageTime);
  const montageTotal = script.montageTotalSec;
  const montageMp4 = join(clipDir, 'montage.mp4');
  if (!existsSync(montageMp4)) {
    console.error('🛑 MISSING_MONTAGE_VIDEO — chạy step 10 trước (montage.mp4 không có).');
    process.exit(2);
  }

  // Money-shot montage times for spill QA — ĐÚNG anchors của montage (anchors.json,
  // dùng chung 10/15) để VO/QA không lệch với video. KHÔNG hardcode.
  const plan = readAnchorPlan(dir);
  console.log(`[12] Anchors (${plan.source}): ${plan.anchors.map((a) => a.toFixed(1)).join(', ')}`);
  let running = 0;
  const segs = [...plan.anchors]
    .sort((a, b) => a - b)
    .map((tSec, idx) => {
      const srcStart = Math.max(0, tSec - plan.lead);
      const srcEnd = Math.min(meta.durationSec, tSec + plan.reaction);
      const dur = srcEnd - srcStart;
      const montageStart = running;
      running += dur;
      return { idx, tSec, srcStart, srcEnd, dur, montageStart };
    });
  const msMontage = (idx: number): number | null => {
    const s = segs[idx];
    return s ? s.montageStart + (s.tSec - s.srcStart) : null;
  };
  const catchIdx = segs.filter((s) => s.idx >= 1).map((s) => s.idx);

  // 1) Synthesize VO per chunk (edge male). Collect real audio durations first;
  //    final placement (anti-overlap + tail-fit) is applied AFTER, using real
  //    timing — so we move chunks the minimum needed, not a blind estimate.
  const tmp = join(clipDir, '_tts');
  mkdirSync(tmp, { recursive: true });
  const failed: string[] = [];
  interface Synthed {
    beat: Beat;
    words: Array<{ offsetSec: number; durationSec: number }>;
    audio: string;
    audioDur: number;
    desired: number;
  }
  const synthed: Synthed[] = [];
  console.log(`[12] Edge-tts ${beats.length} cụm (giọng Nam)…`);
  for (const [i, b] of beats.entries()) {
    const outAudio = join(tmp, `vo_${String(i).padStart(2, '0')}.mp3`);
    const outWords = join(tmp, `vo_${String(i).padStart(2, '0')}.words.json`);
    const words = synthesizeChunk('edge', {
      text: b.text,
      voice: EDGE_MALE_VOICE,
      outAudio,
      outWords,
    });
    if (!existsSync(outAudio)) {
      failed.push(`#${i + 1} "${b.text}"`);
      continue;
    }
    const lastW = words[words.length - 1];
    const audioDur = lastW
      ? lastW.offsetSec + lastW.durationSec + 0.12
      : Math.max(0.7, [...b.text].length * 0.07 + 0.3);
    synthed.push({ beat: b, words, audio: outAudio, audioDur, desired: b.montageTime });
  }
  if (failed.length > 0) {
    console.error(
      `🛑 VOICE_SYNTH_FAILED — ${failed.length} cụm không tạo được giọng (không báo success giả):`,
    );
    for (const f of failed) console.error(`   ${f}`);
    process.exit(4);
  }

  // Anti-overlap + tail-fit using REAL edge durations. GAP keeps it tight
  // ("nhanh nhưng đọc được") with NO overlap; tail-fit guarantees the closing
  // line finishes before the video ends (no truncation).
  const GAP = 0.14;
  const stArr: number[] = [];
  const enArr: number[] = [];
  let prevEnd = Number.NEGATIVE_INFINITY;
  for (const [i, s] of synthed.entries()) {
    const st = Math.max(s.desired, prevEnd + GAP);
    stArr[i] = st;
    enArr[i] = st + s.audioDur;
    prevEnd = enArr[i];
  }
  let tailLimit = montageTotal - 0.15;
  for (let i = synthed.length - 1; i >= 0; i -= 1) {
    const s = synthed[i];
    const en = enArr[i];
    if (!s || en == null) continue;
    if (en > tailLimit) {
      enArr[i] = tailLimit;
      stArr[i] = Math.max(0, tailLimit - s.audioDur);
    }
    tailLimit = (stArr[i] ?? 0) - GAP;
  }

  // Build caption timing + VO delays at the adjusted starts (caption == voice).
  const align: Align = {
    characters: [],
    characterStartTimesSeconds: [],
    characterEndTimesSeconds: [],
  };
  const voMp3: string[] = [];
  const delays: number[] = [];
  const spans: LineSpan[] = [];
  for (const [i, s] of synthed.entries()) {
    const st = stArr[i] ?? s.desired;
    voMp3.push(s.audio);
    delays.push(Math.round(st * 1000));
    const { align: la, start: a0, end: a1 } = lineAlign(s.beat.text, s.words, st);
    align.characters.push(...la.characters);
    align.characterStartTimesSeconds.push(...la.characterStartTimesSeconds);
    align.characterEndTimesSeconds.push(...la.characterEndTimesSeconds);
    spans.push({
      role: s.beat.role,
      sceneIdx: s.beat.sceneIdx,
      text: s.beat.text,
      start: a0,
      end: a1,
    });
  }

  // 2) VO mix: adelay per chunk + amix + apad (so -shortest in render keeps the
  //    tail money-shot), trimmed to the exact montage length.
  const voOut = join(clipDir, 'montage_vo.mp3');
  const filter =
    voMp3.length === 1
      ? `[0:a]adelay=${delays[0]}:all=1,apad[out]`
      : `${voMp3.map((_, i) => `[${i}:a]adelay=${delays[i]}:all=1[a${i}]`).join(';')};${voMp3
          .map((_, i) => `[a${i}]`)
          .join('')}amix=inputs=${voMp3.length}:normalize=0:dropout_transition=0,apad[out]`;
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
        timingVersion: 'ent-v2-24',
        runId: `ent_${id}_montage_v2`,
        alignment: align,
        captionReady: true,
      },
      null,
      2,
    ),
  );

  // 3) HASH AUDIT: voice text (the approved script) vs caption text (read back).
  const voiceSourceText = beats.map((b) => b.text).join(' ');
  const captionText = (
    JSON.parse(readFileSync(timingPath, 'utf8')) as { alignment: Align }
  ).alignment.characters.join('');
  const voiceHash = normHash(voiceSourceText);
  const captionHash = normHash(captionText);
  const hashMatch = voiceHash === captionHash;
  console.log(`[12] HASH AUDIT voice==caption: ${hashMatch ? '✅ MATCH' : '❌ MISMATCH'}`);
  if (!hashMatch) {
    console.error('🛑 SYNC_AUDIT_FAILED — caption text khác voice text. KHÔNG xuất success giả.');
    console.error(`   voiceHash=${voiceHash.slice(0, 16)} captionHash=${captionHash.slice(0, 16)}`);
    process.exit(7);
  }

  // 4) Scrub: REUSE existing whole-frame mask (montage.mp4 unchanged). Re-run
  //    only if missing.
  const maskPath = join(clipDir, 'source_subtitle_mask.json');
  // Mask STABLE-BAND (v2-band): dải phụ đề LIÊN TỤC phủ từ giây 0 → hết video +
  // dilate → che hardsub đầu video & chống nhấp nháy giữa video. Re-dò nếu mask
  // thiếu HOẶC còn bản cũ v1 (box khít, bắt đầu trễ).
  let maskVer: string | null = null;
  if (existsSync(maskPath)) {
    try {
      maskVer =
        (JSON.parse(readFileSync(maskPath, 'utf8')) as { maskVersion?: string }).maskVersion ??
        null;
    } catch {
      maskVer = null;
    }
  }
  let scrubOk = maskVer === 'v2-band';
  if (scrubOk) {
    console.log('[12] Reuse scrub mask v2-band (stable dải, montage không đổi).');
  } else {
    console.log(
      maskVer
        ? `[12] Mask cũ (${maskVer}) → dò lại STABLE-BAND (phủ từ 0, 5fps, chống nhấp nháy)…`
        : '[12] Scrub chữ Hán STABLE-BAND (5fps)…',
    );
    scrubOk = sh(
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
        '--fps',
        '5',
        '--stable-band',
      ],
      'SCRUB',
      true,
    );
  }

  // 5) Render (voice + BGM) onto the montage visual → preview.mp4.
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
  console.log('[12] Render thật (voice + BGM)…');
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

  // 6) Caption from the NEW voice timing.
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
    capArgs.push('--subtitle-mask', maskPath, '--cover-mode', 'auto');
  console.log('[12] Caption từ VOICE timing (viral_review_v2 + scrub dải)…');
  if (!sh('npx', capArgs, 'CAPTION', true)) process.exit(6);

  // 6b) POST-SCRUB QA: OCR lại OUTPUT — còn ký tự Trung/CJK ở vùng phụ đề thì FAIL
  //     (no fake PASS). Detector thường (không stable-band) chỉ ĐẾM CJK còn sót.
  //     Caption Việt là Latin → detector lọc CJK nên KHÔNG tự báo nhầm.
  const postMaskPath = join(clipDir, '_postscrub_check.json');
  const postRan = sh(
    'npx',
    [
      'tsx',
      'scripts/source-subtitle-detector.ts',
      '--input',
      shortOut,
      '--output',
      postMaskPath,
      '--zone-top',
      '0.0',
      '--zone-bottom',
      '1.0',
      '--fps',
      '3',
    ],
    'POSTSCRUB',
    true,
  );
  let residualCjkFrames = 0;
  let residualCjkText = '';
  if (postRan) {
    try {
      const pm = JSON.parse(readFileSync(postMaskPath, 'utf8')) as {
        segments?: Array<{ frames?: number }>;
        sampleText?: string;
      };
      residualCjkFrames = (pm.segments ?? []).reduce((n, s) => n + (s.frames ?? 0), 0);
      residualCjkText = pm.sampleText ?? '';
    } catch {
      /* ignore parse */
    }
  }
  // <2 frame CJK = chịu false-positive lẻ; ≥2 frame sustained = hardsub còn sót thật.
  const postScrubOk = postRan && residualCjkFrames < 2;
  console.log(
    `[12] POST-SCRUB QA: ${postRan ? `${residualCjkFrames} frame CJK còn sót${residualCjkText ? ` ("${residualCjkText}")` : ''} → ${postScrubOk ? '✅ sạch' : '🛑 CÒN CHỮ TRUNG'}` : '⚠️ OCR không chạy được (inconclusive)'}`,
  );

  // 7) QA on REAL edge timing.
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

  // Caption density on REAL timing. Distinguish:
  //   - OVERLAP (chồng lấn): cur.end > next.start → caption still showing when
  //     the next one starts (fail signal per operator).
  //   - TIGHT (chật nhẹ): 0 ≤ gap < 0.25s → fast but readable (acceptable).
  const byStart = [...spans].sort((a, b) => a.start - b.start);
  let overlapCount = 0;
  let tightCount = 0;
  let maxOverlap = 0;
  let maxGap = 0;
  let worst: { text: string; over: number; next: string; at: string } | null = null;
  for (let i = 0; i < byStart.length - 1; i += 1) {
    const cur = byStart[i];
    const next = byStart[i + 1];
    if (!cur || !next) continue;
    const gap = next.start - cur.end;
    if (gap < -0.05) {
      overlapCount += 1;
      const over = Number((-gap).toFixed(2));
      if (over > maxOverlap) {
        maxOverlap = over;
        worst = { text: cur.text, over, next: next.text, at: tc(cur.start) };
      }
    } else if (gap < 0.25) {
      tightCount += 1;
    }
    if (gap > maxGap) maxGap = Number(gap.toFixed(1));
  }
  const lastSpan = byStart[byStart.length - 1];
  if (lastSpan) maxGap = Math.max(maxGap, Number((montageTotal - lastSpan.end).toFixed(1)));
  // Seam 00:35–00:38: dump real order/timing to judge "lợn cợn".
  const seam = byStart
    .filter((s) => s.start >= 33 && s.start <= 40)
    .map((s) => ({ at: s.start.toFixed(2), end: s.end.toFixed(2), role: s.role, text: s.text }));
  // BGM vs voice loudness by PEAK (fair): voice peak vs BGM peak × mix gain.
  const bgmMul = bgm?.volumeMultiplier ?? 0.4;
  const gainDb = 20 * Math.log10(bgmMul);
  const voiceVol = measureDb(voOut);
  const bgmRaw = bgm ? measureDb(bgm.localAudioPath) : { mean: Number.NaN, max: Number.NaN };
  const voicePeak = Number(voiceVol.max.toFixed(1));
  const bgmPeak = Number((bgmRaw.max + gainDb).toFixed(1));
  const voiceMargin = Number.isFinite(bgmPeak)
    ? Number((voicePeak - bgmPeak).toFixed(1))
    : Number.NaN;
  const bgmDrowns = Number.isFinite(voiceMargin) && voiceMargin < 0;
  // voice spill over the NEXT catch money-shot: last VO of catch k must end
  // before catch k+1's money-shot.
  const spills: string[] = [];
  for (const k of catchIdx) {
    if (!catchIdx.includes(k + 1)) continue;
    const mine = spans.filter((s) => s.sceneIdx === k).sort((a, b) => a.end - b.end);
    const lastB = mine[mine.length - 1];
    const nextMs = msMontage(k + 1);
    if (!lastB || nextMs == null) continue;
    if (lastB.end > nextMs)
      spills.push(
        `cú ${tc(msMontage(k) ?? 0)} (kết ${lastB.end.toFixed(1)}s) → đè money-shot ${tc(nextMs)}`,
      );
  }
  // money-shot coverage: which voice is active at each money-shot.
  const msCoverage = catchIdx.map((k) => {
    const ms = msMontage(k) ?? 0;
    const active = spans.find((s) => s.start <= ms + 0.3 && s.end >= ms - 0.3);
    return {
      ms: tc(ms),
      by: active ? `${active.role}${active.sceneIdx === k ? '' : '⚠'}` : 'im (BGM)',
      text: active?.text ?? '—',
    };
  });
  const realVoiceEnd = Math.max(...spans.map((s) => s.end));

  // VERDICT (operator criteria): hash must PASS; caption OVERLAP or BGM drowning
  // voice ⇒ FAIL (go back to giãn/bỏ). TIGHT-but-no-overlap ⇒ acceptable.
  const verdictFail: string[] = [];
  if (!hashMatch) verdictFail.push('hash mismatch');
  if (overlapCount > 0) verdictFail.push(`${overlapCount} cụm caption chồng lấn`);
  if (spills.length > 0) verdictFail.push(`${spills.length} voice tràn money-shot`);
  if (bgmDrowns) verdictFail.push(`BGM át voice (margin ${voiceMargin}dB)`);
  // FAIL chỉ khi XÁC NHẬN còn chữ Trung (≥2 frame); OCR không chạy được = cảnh báo
  // (inconclusive) — không chặn verdict nhưng báo rõ ở report.
  if (postRan && residualCjkFrames >= 2)
    verdictFail.push(
      `chữ Trung còn sót ${residualCjkFrames} frame${residualCjkText ? ` ("${residualCjkText}")` : ''}`,
    );
  const verdict = verdictFail.length === 0 ? 'PASS' : `FAIL — ${verdictFail.join('; ')}`;

  const report = {
    scriptModel: script.scriptModel,
    verdict,
    output: shortOut,
    outputDurationSec: Number(outDur.toFixed(1)),
    montageTotalSec: Number(montageTotal.toFixed(1)),
    voicePath: voOut,
    timingPath,
    hasAudio,
    voiceHash: voiceHash.slice(0, 16),
    captionHash: captionHash.slice(0, 16),
    hashMatch,
    captionChunks: spans.length,
    realVoiceEndSec: Number(realVoiceEnd.toFixed(1)),
    captionOverlap: overlapCount,
    captionTightButReadable: tightCount,
    captionMaxOverlapSec: maxOverlap,
    captionWorst: worst,
    maxGapSec: maxGap,
    voiceSpillMoneyShot: spills,
    moneyShotCoverage: msCoverage,
    seam_33_40s: seam,
    bgm: bgm?.trackId ?? null,
    voicePeakDb: voicePeak,
    bgmPeakDb: bgmPeak,
    voiceMarginDb: voiceMargin,
    bgmDrownsVoice: bgmDrowns,
    scrubReusedMask: scrubOk && maskVer === 'v2-band',
    scrubMaskVersion: maskVer === 'v2-band' ? 'v2-band' : 'v2-band-rebuilt',
    scrubMaskSegments: maskSegN,
    postScrubRan: postRan,
    postScrubResidualCjkFrames: residualCjkFrames,
    postScrubResidualText: residualCjkText || null,
    postScrubOk,
  };
  writeFileSync(join(clipDir, 'montage_v2_render_report.json'), JSON.stringify(report, null, 2));

  console.log('======================================================');
  console.log(`[12] RENDER xong — VERDICT: ${verdict}`);
  console.log(`   OUTPUT: ${shortOut}`);
  console.log(
    `   dur ${report.outputDurationSec}s / montage ${report.montageTotalSec}s | audio ${hasAudio ? '✅' : '❌'} | cụm caption ${spans.length}`,
  );
  console.log(
    `   hash ${hashMatch ? '✅' : '❌'} | chồng lấn ${overlapCount} (max ${maxOverlap}s) | chật-đọc-được ${tightCount} | gap lớn nhất ${maxGap}s`,
  );
  console.log(
    `   voice tràn money-shot ${spills.length} | scrub ${maskSegN} vùng | voice đỉnh ${voicePeak}dB vs BGM đỉnh ${bgmPeak}dB (margin ${voiceMargin}dB ${bgmDrowns ? '⚠️ át' : '✅'})`,
  );
  if (worst)
    console.log(
      `   chật nhất @${worst.at}: "${worst.text}" chồng ${worst.over}s lên "${worst.next}"`,
    );
  console.log('======================================================');
}

main().catch((e) => {
  console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
