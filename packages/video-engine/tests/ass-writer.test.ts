import { describe, expect, it } from 'vitest';
import { buildAss } from '../src/index.js';
import type { RenderCanvas, SubtitleCueInput, SubtitleStyleInput } from '../src/index.js';

const canvas: RenderCanvas = { width: 1080, height: 1920, fps: 30 };
const style: SubtitleStyleInput = {
  font: 'Montserrat-SemiBold',
  sizePx: 54,
  primary: '#FFFFFF',
  outline: '#000000',
  outlineWidth: 3,
  position: 'lower-third',
  maxWordsPerLine: 12,
  safeAreaBottomPct: 12,
};

describe('buildAss — ASS V4+', () => {
  it('đủ 3 section + Style + Dialogue + màu + margin + thời gian', () => {
    const cues: SubtitleCueInput[] = [
      { index: 0, text: 'Chào các bạn,', startSec: 0.1, endSec: 0.767375 },
      { index: 1, text: 'giá 75 giây', startSec: 75.5, endSec: 76.0 },
    ];
    const ass = buildAss(cues, style, canvas);

    expect(ass).toContain('[Script Info]');
    expect(ass).toContain('ScriptType: v4.00+');
    expect(ass).toContain('PlayResX: 1080');
    expect(ass).toContain('PlayResY: 1920');
    expect(ass).toContain('[V4+ Styles]');
    expect(ass).toContain('[Events]');

    // trắng → &H00FFFFFF; outline đen → &H00000000; font + size giữ nguyên
    expect(ass).toContain('Style: Default,Montserrat-SemiBold,54,&H00FFFFFF,');
    expect(ass).toContain(',&H00000000,');
    // alignment 2 (đáy-giữa), MarginV = 1920*12% = 230
    expect(ass).toContain(',2,60,60,230,1');

    // cs 2 chữ số, carry phút đúng
    expect(ass).toContain('Dialogue: 0,0:00:00.10,0:00:00.77,Default,,0,0,0,,Chào các bạn,');
    expect(ass).toContain('0:01:15.50'); // 75.5s
  });

  it('màu tuỳ biến: primary #1F6C9F → &H009F6C1F (đảo R↔B)', () => {
    const ass = buildAss(
      [{ index: 0, text: 'x', startSec: 0, endSec: 1 }],
      { ...style, primary: '#1F6C9F' },
      canvas,
    );
    expect(ass).toContain('Style: Default,Montserrat-SemiBold,54,&H009F6C1F,');
  });

  it('mảng rỗng → vẫn có header, KHÔNG có Dialogue', () => {
    const ass = buildAss([], style, canvas);
    expect(ass).toContain('[Events]');
    expect(ass).not.toContain('Dialogue:');
  });

  it('escape: xuống dòng → \\N, ngoặc nhọn → ngoặc thường', () => {
    const ass = buildAss(
      [{ index: 0, text: 'dòng1\ndòng2 {x}', startSec: 0, endSec: 1 }],
      style,
      canvas,
    );
    expect(ass).toContain('dòng1\\Ndòng2 (x)');
  });
});
