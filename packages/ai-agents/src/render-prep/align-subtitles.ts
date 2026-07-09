// Khớp thời gian phụ đề (RFC §3) — LOGIC THUẦN, không fs/API.
// Cưới 2 lớp: lớp CHỮ (chunks ≤12 từ từ chunkForSubtitles) + lớp TIMING (words
// từ TTS). Vì chunker giữ đúng thứ tự & đủ từ, mỗi dòng "bốc" đúng ttsWordCount(dòng)
// từ trong mảng words theo con trỏ chạy.
//
// Chống-lệch 2 tầng (07/2026):
//   • Tầng A — alignSubtitles: khớp TỪNG TỪ, đếm bằng ttsWordCount (chẻ dấu ngăn
//     trong-từ để khớp cách edge-tts tokenize). Lệch ⇒ throw (fail-fast, cho test).
//   • Tầng B — alignSubtitlesResilient: nếu Tầng A vẫn lệch (quirk TTS khác), KHÔNG
//     throw mà chia span [từ đầu→từ cuối] theo tỉ lệ ký tự. Luôn ra cue hợp lệ.

import type { EdgeWord, SubtitleCue, SubtitleTiming } from './types.js';

// edge-tts CHẺ token tại dấu ngăn trong-từ (vd "hàng/bio" → "hàng"+"bio"). Để đếm
// đơn-vị-timing KHỚP với TTS, ngoài khoảng trắng phải chẻ thêm tại `/ - – —`.
// Dùng alternation (KHÔNG char-class) để né biome noMisleadingCharacterClass.
// Mirror countWords: trim → split → filter(Boolean). KHÔNG đổi text hiển thị.
const TTS_SEPARATORS = /(?:\s|\/|–|—|-)+/;

/** Số đơn-vị-timing của 1 đoạn — khớp granularity token của edge-tts. */
export function ttsWordCount(text: string): number {
  return text.trim().split(TTS_SEPARATORS).filter(Boolean).length;
}

/** Kết quả khớp có kèm nhãn tầng đã dùng (perfect_match | proportional_fallback). */
export interface ResilientAlignment {
  cues: SubtitleCue[];
  timing: SubtitleTiming;
}

/**
 * Tầng A — khớp CHÍNH XÁC từng từ. Guardrail: tổng đơn-vị-timing của chunks PHẢI
 * khớp số từ TTS. Lệch = FAIL trung thực (không đoán bừa) → dùng cho unit test +
 * làm lõi cho Tầng resilient. Text hiển thị giữ nguyên (vd "hàng/bio" vẫn 1 dòng-chữ).
 */
export function alignSubtitles(chunks: string[], words: EdgeWord[]): SubtitleCue[] {
  const totalUnits = chunks.reduce((sum, c) => sum + ttsWordCount(c), 0);
  if (totalUnits !== words.length) {
    throw new Error(
      `SUBTITLE_WORD_COUNT_MISMATCH: chunks có ${totalUnits} đơn-vị-timing nhưng TTS trả ${words.length} từ — không thể khớp thời gian chính xác.`,
    );
  }

  const cues: SubtitleCue[] = [];
  let cursor = 0;
  for (const chunk of chunks) {
    const n = ttsWordCount(chunk);
    if (n === 0) continue; // dòng rỗng (phòng thủ) — không tạo cue, không tiêu từ.
    const first = words[cursor];
    const last = words[cursor + n - 1];
    if (first === undefined || last === undefined) {
      // Không thể xảy ra khi guardrail đã pass; giữ để thoả strict + phòng thủ.
      throw new Error('SUBTITLE_ALIGN_OUT_OF_RANGE: con trỏ vượt mảng words.');
    }
    cues.push({
      index: cues.length,
      text: chunk,
      startSec: first.offsetSec,
      endSec: last.offsetSec + last.durationSec,
    });
    cursor += n;
  }
  return cues;
}

/**
 * Tầng B — Proportional Fallback (RFC §3, hardening 07/2026). Dùng khi số từ TTS
 * KHÔNG khớp chunks kể cả sau chuẩn hoá token. KHÔNG throw: lấy span [từ đầu →
 * từ cuối] rồi chia cho từng dòng theo TỈ LỆ ĐỘ DÀI KÝ TỰ (dòng dài đọc lâu hơn).
 * Timing xấp xỉ nhưng đơn điệu tăng, không chồng lấn — đủ để render preview.
 */
function proportionalFallback(chunks: string[], words: EdgeWord[]): SubtitleCue[] {
  const lines = chunks.filter((c) => c.trim().length > 0);
  const first = words[0];
  const last = words[words.length - 1];
  if (first === undefined || last === undefined) {
    // words rỗng = audio rỗng: lỗi THẬT (không phải lệch từ) → vẫn báo lỗi.
    throw new Error('SUBTITLE_ALIGN_NO_WORDS: mảng words rỗng — không thể suy thời gian.');
  }
  const spanStart = first.offsetSec;
  const spanEnd = last.offsetSec + last.durationSec;
  const spanDur = Math.max(0, spanEnd - spanStart);
  const totalChars = lines.reduce((sum, c) => sum + c.trim().length, 0) || 1;

  const cues: SubtitleCue[] = [];
  let cursor = spanStart;
  lines.forEach((line, i) => {
    const share = (line.trim().length / totalChars) * spanDur;
    const startSec = cursor;
    // Dòng cuối neo đúng spanEnd để tránh trôi lệch do cộng dồn số thực.
    const endSec = i === lines.length - 1 ? spanEnd : cursor + share;
    cues.push({ index: cues.length, text: line, startSec, endSec });
    cursor = endSec;
  });
  return cues;
}

/**
 * Bọc chống-lệch dùng cho CLI: thử Tầng A → khớp thì 'perfect_match'; lệch thì rơi
 * xuống Tầng B 'proportional_fallback' (không nổ Exit 8). Pipeline KHÔNG bao giờ kẹt
 * vì 1 quirk token lạ của TTS — fail-safe cho production, fail-fast (Tầng A) cho test.
 */
export function alignSubtitlesResilient(chunks: string[], words: EdgeWord[]): ResilientAlignment {
  const totalUnits = chunks.reduce((sum, c) => sum + ttsWordCount(c), 0);
  if (totalUnits === words.length) {
    return { cues: alignSubtitles(chunks, words), timing: 'perfect_match' };
  }
  return { cues: proportionalFallback(chunks, words), timing: 'proportional_fallback' };
}
