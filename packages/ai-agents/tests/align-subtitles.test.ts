import { describe, expect, it } from 'vitest';
import {
  alignSubtitles,
  alignSubtitlesResilient,
  buildRenderPlan,
  ttsWordCount,
} from '../src/index.js';
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
    // mặc định (5 tham số) = perfect_match
    expect(plan.subtitleTiming).toBe('perfect_match');
    // preview.mp4 đặt cạnh audio
    expect(plan.output.path).toBe('data/temp/jobs/job_demo_001/preview.mp4');
  });
});

describe('ttsWordCount (chống-lệch — chẻ dấu ngăn trong-từ)', () => {
  it('chẻ "/" như edge-tts: "hàng/bio" = 2 đơn-vị', () => {
    expect(ttsWordCount('hàng/bio')).toBe(2);
    expect(ttsWordCount('ghé giỏ hàng/bio mình nhé')).toBe(6);
  });

  it('chẻ cả gạch ngang - – —', () => {
    expect(ttsWordCount('combo 2-trong-1')).toBe(4); // combo | 2 | trong | 1
    expect(ttsWordCount('giá 10–20 nghìn')).toBe(4); // giá | 10 | 20 | nghìn (en-dash)
    expect(ttsWordCount('mã A—B')).toBe(3); // mã | A | B (em-dash)
  });

  it('KHÔNG chẻ số tiền "10.000đ" (dấu chấm không phải dấu ngăn)', () => {
    expect(ttsWordCount('giá chỉ 10.000đ thôi')).toBe(4);
  });
});

describe('alignSubtitlesResilient (2 tầng chống-lệch)', () => {
  // Dòng 2 chứa "hàng/bio": edge-tts nhả 6 token nhưng whitespace chỉ 5 →
  // countWords cũ sẽ THROW; ttsWordCount (Tầng A) khớp 6 → perfect_match.
  const chunks = ['Chào bạn nhé', 'ghé giỏ hàng/bio mình nhé'];
  const words: EdgeWord[] = [
    { text: 'Chào', offsetSec: 0.0, durationSec: 0.5 },
    { text: 'bạn', offsetSec: 0.5, durationSec: 0.5 },
    { text: 'nhé', offsetSec: 1.0, durationSec: 0.5 }, // dòng 1 kết 1.5
    { text: 'ghé', offsetSec: 2.0, durationSec: 0.5 },
    { text: 'giỏ', offsetSec: 2.5, durationSec: 0.5 },
    { text: 'hàng', offsetSec: 3.0, durationSec: 0.5 }, // edge chẻ "hàng/bio"
    { text: 'bio', offsetSec: 3.5, durationSec: 0.5 },
    { text: 'mình', offsetSec: 4.0, durationSec: 0.5 },
    { text: 'nhé', offsetSec: 4.5, durationSec: 0.5 }, // dòng 2 kết 5.0
  ];

  it('Tầng A: khớp từng từ qua ttsWordCount — text hiển thị GIỮ NGUYÊN "hàng/bio"', () => {
    const { cues, timing } = alignSubtitlesResilient(chunks, words);
    expect(timing).toBe('perfect_match');
    expect(cues).toEqual([
      { index: 0, text: 'Chào bạn nhé', startSec: 0.0, endSec: 1.5 },
      { index: 1, text: 'ghé giỏ hàng/bio mình nhé', startSec: 2.0, endSec: 5.0 },
    ]);
    // chứng minh code CŨ (countWords) sẽ vỡ ở đây:
    expect(() => alignSubtitles(chunks, words)).not.toThrow();
  });

  it('Tầng B: lệch từ nghiêm trọng → KHÔNG throw, chia theo tỉ lệ ký tự', () => {
    // 9 đơn-vị-timing nhưng TTS chỉ trả 3 từ (quirk nuốt từ) → không khớp nổi.
    const lines = ['dòng một hai ba', 'dòng bốn năm sáu bảy'];
    const fewWords: EdgeWord[] = [
      { text: 'x', offsetSec: 0.0, durationSec: 1.0 },
      { text: 'y', offsetSec: 1.0, durationSec: 1.0 },
      { text: 'z', offsetSec: 2.0, durationSec: 1.0 }, // span kết 3.0
    ];
    let result: ReturnType<typeof alignSubtitlesResilient> | undefined;
    expect(() => {
      result = alignSubtitlesResilient(lines, fewWords);
    }).not.toThrow();
    const { cues, timing } = result ?? { cues: [], timing: 'perfect_match' as const };
    expect(timing).toBe('proportional_fallback');
    expect(cues).toHaveLength(2);
    // text giữ nguyên, span neo đúng đầu–cuối, đơn điệu & liền mạch:
    expect(cues[0]?.text).toBe('dòng một hai ba');
    expect(cues[0]?.startSec).toBe(0.0);
    expect(cues[1]?.endSec).toBe(3.0);
    expect(cues[0]?.endSec).toBe(cues[1]?.startSec); // liền mạch, không hở/chồng
    // dòng dài hơn (nhiều ký tự hơn) được chia thời lượng lớn hơn:
    const d0 = (cues[0]?.endSec ?? 0) - (cues[0]?.startSec ?? 0);
    const d1 = (cues[1]?.endSec ?? 0) - (cues[1]?.startSec ?? 0);
    expect(d1).toBeGreaterThan(d0);
  });
});
