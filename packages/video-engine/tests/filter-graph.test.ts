import { describe, expect, it } from 'vitest';
import { buildFfmpegPlan, buildFilterGraph, dbToLinear } from '../src/index.js';
import type { RenderPlanInput } from '../src/index.js';

function basePlan(overrides: Partial<RenderPlanInput> = {}): RenderPlanInput {
  return {
    jobId: 'job_demo',
    canvas: { width: 1080, height: 1920, fps: 30 },
    durationSec: 47.4,
    videoSource: { path: 'source_video.mp4', trimStartSec: 0, trimEndSec: 47.4, fit: 'cover' },
    audio: {
      voiceoverPath: 'voiceover.mp3',
      voiceGainDb: 0,
      bgmPath: null,
      bgmGainDb: -18,
      duckUnderVoice: true,
    },
    subtitles: [
      { index: 0, text: 'Chào các bạn,', startSec: 0.1, endSec: 0.767375 },
      { index: 1, text: 'giá chỉ 10.000đ', startSec: 0.85, endSec: 2.84 },
    ],
    subtitleStyle: {
      font: 'Montserrat-SemiBold',
      sizePx: 54,
      primary: '#FFFFFF',
      outline: '#000000',
      outlineWidth: 3,
      position: 'lower-third',
      maxWordsPerLine: 12,
      safeAreaBottomPct: 12,
    },
    output: { path: 'preview.mp4' },
    ...overrides,
  };
}

describe('dbToLinear', () => {
  it('0dB → "1", −18dB → "0.1259"', () => {
    expect(dbToLinear(0)).toBe('1');
    expect(dbToLinear(-18)).toBe('0.1259');
  });
});

describe('buildFfmpegPlan — gánh video + audio + sub trong 1 graph', () => {
  it('TC1 — Có BGM + Ducking (sidechaincompress)', () => {
    const plan = basePlan({
      audio: {
        voiceoverPath: 'voiceover.mp3',
        voiceGainDb: 0,
        bgmPath: 'bgm_007.mp3',
        bgmGainDb: -18,
        duckUnderVoice: true,
      },
    });
    const out = buildFfmpegPlan(plan);

    // 3 input: video + voice + bgm
    expect(out.inputs).toHaveLength(3);
    expect(out.inputs[2]?.path).toBe('bgm_007.mp3');

    // audio ducking chuẩn
    expect(out.filterComplex).toContain('[1:a]volume=1,asplit=2[vkey][vmix]');
    expect(out.filterComplex).toContain('[2:a]volume=0.1259[bgm]');
    expect(out.filterComplex).toContain(
      '[bgm][vkey]sidechaincompress=threshold=0.06:ratio=6:attack=15:release=350[bgmduck]',
    );
    expect(out.filterComplex).toContain(
      '[bgmduck][vmix]amix=inputs=2:normalize=0:dropout_transition=0[aout]',
    );

    // video cover + burn sub
    expect(out.filterComplex).toContain('force_original_aspect_ratio=increase');
    expect(out.filterComplex).toContain('crop=1080:1920');
    expect(out.filterComplex).toContain('subtitles=render_subs.ass[vout]');

    // map + encode
    expect(out.maps).toEqual(['[vout]', '[aout]']);
    expect(out.encodeArgs).toContain('libx264');
    expect(out.encodeArgs).toContain('20'); // crf
    expect(out.encodeArgs).toContain('-t');
    expect(out.encodeArgs).toContain('47.400');
  });

  it('TC2 — Không BGM (voice-only), cover', () => {
    const out = buildFfmpegPlan(basePlan());
    expect(out.inputs).toHaveLength(2);
    expect(out.filterComplex).toContain('[1:a]volume=1[aout]');
    expect(out.filterComplex).not.toContain('amix');
    expect(out.filterComplex).not.toContain('sidechaincompress');
    expect(out.maps).toEqual(['[vout]', '[aout]']);
  });

  it('TC3 — fit=contain → pad thay vì crop', () => {
    const plan = basePlan({
      videoSource: { path: 's.mp4', trimStartSec: 0, trimEndSec: 47.4, fit: 'contain' },
    });
    const g = buildFilterGraph(plan);
    expect(g.filterComplex).toContain('force_original_aspect_ratio=decrease');
    expect(g.filterComplex).toContain('pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black');
    expect(g.filterComplex).not.toContain('crop=1080:1920');
  });

  it('TC4 — Có BGM nhưng duckUnderVoice=false → amix tĩnh, KHÔNG sidechain', () => {
    const plan = basePlan({
      audio: {
        voiceoverPath: 'v.mp3',
        voiceGainDb: 0,
        bgmPath: 'b.mp3',
        bgmGainDb: -18,
        duckUnderVoice: false,
      },
    });
    const out = buildFfmpegPlan(plan);
    expect(out.filterComplex).toContain('[vo][bgm]amix=inputs=2:duration=first:normalize=0[aout]');
    expect(out.filterComplex).not.toContain('sidechaincompress');
    expect(out.filterComplex).not.toContain('asplit');
  });

  it('TC5 — Không có subtitle → video map về [base], không filter subtitles', () => {
    const out = buildFfmpegPlan(basePlan({ subtitles: [] }));
    expect(out.hasSubtitles).toBe(false);
    expect(out.filterComplex).not.toContain('subtitles=');
    expect(out.maps).toEqual(['[base]', '[aout]']);
  });
});
