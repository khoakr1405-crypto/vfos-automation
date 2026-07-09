// Khớp thời gian phụ đề (RFC §3) — LOGIC THUẦN, không fs/API.
// Cưới 2 lớp: lớp CHỮ (chunks ≤12 từ từ chunkForSubtitles) + lớp TIMING (words
// từ TTS). Vì chunker giữ đúng thứ tự & đủ từ, mỗi dòng "bốc" đúng countWords(dòng)
// từ trong mảng words theo con trỏ chạy.

import { countWords } from '@vfos/script-writer';
import type { EdgeWord, SubtitleCue } from './types.js';

export function alignSubtitles(chunks: string[], words: EdgeWord[]): SubtitleCue[] {
  // Guardrail: tổng từ của chunks PHẢI khớp số từ TTS trả về. Lệch = TTS nuốt/thêm
  // từ → không thể gán thời gian an toàn → FAIL trung thực (không đoán bừa).
  const totalChunkWords = chunks.reduce((sum, c) => sum + countWords(c), 0);
  if (totalChunkWords !== words.length) {
    throw new Error(
      `SUBTITLE_WORD_COUNT_MISMATCH: chunks có ${totalChunkWords} từ nhưng TTS trả ${words.length} từ — không thể khớp thời gian an toàn.`,
    );
  }

  const cues: SubtitleCue[] = [];
  let cursor = 0;
  for (const chunk of chunks) {
    const n = countWords(chunk);
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
