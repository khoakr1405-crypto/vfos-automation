// ass-writer (RFC §3) — LOGIC THUẦN. Biên dịch subtitles[] + subtitleStyle → chuỗi
// ASS V4+ (Advanced SubStation Alpha). Runner (R2) ghi chuỗi này ra file .ass rồi
// ffmpeg burn qua filter `subtitles=`. KHÔNG fs/I/O ở đây.

import type { RenderCanvas, SubtitleCueInput, SubtitleStyleInput } from './types.js';

// '#RRGGBB' → ASS '&HAABBGGRR' (AA=00 = mờ đục hoàn toàn). Đảo byte R↔B.
function hexToAss(hex: string): string {
  const clean = hex.replace('#', '').padStart(6, '0');
  const rr = clean.slice(0, 2);
  const gg = clean.slice(2, 4);
  const bb = clean.slice(4, 6);
  return `&H00${bb}${gg}${rr}`.toUpperCase();
}

// giây → 'H:MM:SS.cc' (centiseconds 2 chữ số). Gom về centisecond rồi bung ra để
// tránh lỗi làm tròn tràn (0.999s → cs=100).
function secToAss(sec: number): string {
  const totalCs = Math.max(0, Math.round(sec * 100));
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs)}`;
}

// 'lower-third' → 2 (đáy-giữa), 'center' → 5, 'top' → 8. Mặc định đáy-giữa.
function alignmentFor(position: string): number {
  if (position === 'center') return 5;
  if (position === 'top') return 8;
  return 2;
}

// Chống vỡ dòng Dialogue: xuống dòng → '\N'; ngoặc nhọn (mã override ASS) → ngoặc thường.
function escapeAssText(text: string): string {
  return text.replace(/\r?\n/g, '\\N').replace(/\{/g, '(').replace(/\}/g, ')');
}

/**
 * Sinh chuỗi ASS V4+ hoàn chỉnh (Script Info + V4+ Styles + Events). `canvas` cần
 * cho PlayResX/Y + MarginV (theo safeAreaBottomPct). Text hiển thị giữ nguyên gốc.
 */
export function buildAss(
  subtitles: SubtitleCueInput[],
  style: SubtitleStyleInput,
  canvas: RenderCanvas,
): string {
  const primary = hexToAss(style.primary);
  const outline = hexToAss(style.outline);
  const alignment = alignmentFor(style.position);
  const marginV = Math.round((canvas.height * style.safeAreaBottomPct) / 100);

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${canvas.width}`,
    `PlayResY: ${canvas.height}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${style.font},${style.sizePx},${primary},&H000000FF,${outline},&H00000000,0,0,0,0,100,100,0,0,1,${style.outlineWidth},0,${alignment},60,60,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const events = subtitles.map(
    (cue) =>
      `Dialogue: 0,${secToAss(cue.startSec)},${secToAss(cue.endSec)},Default,,0,0,0,,${escapeAssText(cue.text)}`,
  );

  return `${[...header, ...events].join('\n')}\n`;
}
