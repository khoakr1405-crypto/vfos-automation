import { describe, expect, it } from 'vitest';
import { alignSubtitles, buildRenderPlan } from '../src/index.js';
import type { EdgeWord } from '../src/index.js';

// 2 dòng phụ đề (4 + 4 = 8 từ). "10.000đ" là 1 token → 4 từ ở dòng 2.
const chunks = ['Chào các bạn nhé', 'giá chỉ 10.000đ thôi'];

// 8 word boundaries khớp; dùng bội số 0.5 (chính xác tuyệt đối trong float).
const words: EdgeWord[] = [
  { text: 'Chào', offsetSec: 0.0, durationSec: 0.5 },
  { text: 'các', offsetSec: 0.5, durationSec: 0.5 },
  { text: 'bạn', offsetSec: 1.0, durationSec: 0.5 },
  { text: 'nhé', offsetSec: 1.5, durationSec: 0.5 }, // dòng 1 kết ở 2.0
  { text: 'giá', offsetSec: 2.5, durationSec: 0.5 }, // dòng 2 bắt đầu 2.5 (có khoảng nghỉ)
  { text: 'chỉ', offsetSec: 3.0, durationSec: 0.5 },
  { text: '10.000đ', offsetSec: 3.5, durationSec: 0.5 },
  { text: 'thôi', offsetSec: 4.0, durationSec: 0.5 }, // dòng 2 kết ở 4.5
];

describe('alignSubtitles (RFC §3 — khớp thời gian phụ đề)', () => {
  it('TC1: khớp thành công — đúng index/text/startSec/endSec', () => {
    const cues = alignSubtitles(chunks, words);
    expect(cues).toEqual([
      { index: 0, text: 'Chào các bạn nhé', startSec: 0.0, endSec: 2.0 },
      { index: 1, text: 'giá chỉ 10.000đ thôi', startSec: 2.5, endSec: 4.5 },
    ]);
    // thời gian tăng dần, không chồng lấn
    expect(cues[0]?.endSec).toBeLessThanOrEqual(cues[1]?.startSec ?? 0);
  });

  it('TC2: guardrail — throw khi số từ chunks ≠ số từ TTS', () => {
    const badWords: EdgeWord[] = [
      { text: 'một', offsetSec: 0, durationSec: 0.5 },
      { text: 'hai', offsetSec: 0.5, durationSec: 0.5 },
    ]; // 2 từ
    expect(() => alignSubtitles(['một hai ba'], badWords)).toThrow(/SUBTITLE_WORD_COUNT_MISMATCH/);
  });

  it('buildRenderPlan: ráp RenderPlan chuẩn từ cues + asset paths', () => {
    const cues = alignSubtitles(chunks, words);
    const plan = buildRenderPlan(
      'job_demo_001',
      4.5,
      cues,
      'data/temp/jobs/job_demo_001/clean_source_video.mp4',
      'data/temp/jobs/job_demo_001/voiceover.mp3',
    );
    expect(plan.renderPlanVersion).toBe('v1');
    expect(plan.jobId).toBe('job_demo_001');
    expect(plan.durationSec).toBe(4.5);
    expect(plan.canvas).toEqual({ width: 1080, height: 1920, fps: 30 });
    expect(plan.videoSource.trimEndSec).toBe(4.5);
    expect(plan.videoSource.fit).toBe('cover');
    expect(plan.audio.voiceoverPath).toBe('data/temp/jobs/job_demo_001/voiceover.mp3');
    expect(plan.subtitles).toHaveLength(2);
    expect(plan.subtitleStyle.maxWordsPerLine).toBe(12);
    // preview.mp4 đặt cạnh audio
    expect(plan.output.path).toBe('data/temp/jobs/job_demo_001/preview.mp4');
  });
});
