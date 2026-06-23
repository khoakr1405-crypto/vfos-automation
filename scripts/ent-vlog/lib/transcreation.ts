import { glossaryBlock } from './fishing-glossary.js';
// 2-pass transcreation (Chinese → Vietnamese) for one clip.
//   Pass 1 — faithful meaning, per segment (không bịa, không bỏ ý).
//   Pass 2 — biên tập giọng vlog câu cá Việt tự nhiên, bám timing từng đoạn.
// Output stays segment-aligned so voice + caption can be timed per segment.
import { chatJson } from './openai.js';

export interface ClipSeg {
  id: number;
  start: number;
  end: number;
  zh: string;
}

export interface TranslatedSeg {
  id: number;
  start: number;
  end: number;
  durationSec: number;
  zh: string;
  vi: string;
}

const PASS1_SYSTEM = `Bạn là biên dịch viên Trung→Việt chuyên video câu cá.
Dịch TRUNG THỰC từng câu thoại tiếng Trung sang tiếng Việt: đúng nghĩa, không bịa thêm, không bỏ ý.
Giữ nguyên con số/tên cá/đơn vị. Trả JSON.`;

const PASS2_SYSTEM = `Bạn là biên tập lời thoại (voice-over) cho kênh vlog CÂU CÁ tiếng Việt, giọng nam, năng lượng, đời thường — kiểu "anh em câu cá" tâm sự với người xem.
Nhiệm vụ: viết lại bản dịch cho TỰ NHIÊN như người Việt nói, giữ năng lượng/cảm xúc, NHƯNG:
- TUYỆT ĐỐI không bịa thông tin không có trong bản gốc.
- Bám sát ý từng đoạn (giữ đúng id), không gộp/không tách đoạn.
- Mỗi đoạn phải đủ NGẮN để đọc vừa trong thời lượng của đoạn đó (xem duration_sec). Câu dài → rút gọn, ưu tiên khẩu ngữ.
- Dùng đúng thuật ngữ câu cá (bảng tham chiếu bên dưới).
- Không emoji, không hashtag, không chèn lời chào/CTA bán hàng.
Trả JSON.`;

export async function transcreateClip(
  apiKey: string,
  opts: { segments: ClipSeg[]; contextVi: string },
): Promise<{ segments: TranslatedSeg[]; notes: string }> {
  const { segments, contextVi } = opts;

  // ---- Pass 1: faithful ----
  const pass1User = [
    `Bối cảnh video: ${contextVi}`,
    'Dịch trung thực từng đoạn sang tiếng Việt. Trả JSON dạng:',
    '{"segments":[{"id":<number>,"vi":"<bản dịch trung thực>"}]}',
    '',
    'Các đoạn thoại tiếng Trung:',
    ...segments.map((s) => `id=${s.id} | ${s.zh}`),
  ].join('\n');

  const pass1 = await chatJson<{ segments: Array<{ id: number; vi: string }> }>(apiKey, {
    system: PASS1_SYSTEM,
    user: pass1User,
    temperature: 0.3,
  });
  const literal = new Map(pass1.segments.map((s) => [s.id, s.vi]));

  // ---- Pass 2: polish to natural vlog tone, timing-aware ----
  const pass2User = [
    `Bối cảnh video: ${contextVi}`,
    '',
    'BẢNG THUẬT NGỮ CÂU CÁ (zh = vi):',
    glossaryBlock(),
    '',
    'Viết lại từng đoạn cho tự nhiên giọng vlog câu cá Việt. Giữ đúng id. Trả JSON dạng:',
    '{"segments":[{"id":<number>,"vi":"<lời thoại đã biên tập>"}],"notes":"<ghi chú ngắn về cách xử lý>"}',
    '',
    'Các đoạn (kèm thời lượng để canh độ dài câu):',
    ...segments.map((s) => {
      const dur = Math.max(0, s.end - s.start);
      return `id=${s.id} | duration_sec=${dur.toFixed(1)} | 中: ${s.zh} | dịch_thô: ${literal.get(s.id) ?? ''}`;
    }),
  ].join('\n');

  const pass2 = await chatJson<{
    segments: Array<{ id: number; vi: string }>;
    notes?: string;
  }>(apiKey, {
    system: PASS2_SYSTEM,
    user: pass2User,
    temperature: 0.6,
  });
  const polished = new Map(pass2.segments.map((s) => [s.id, s.vi]));

  const out: TranslatedSeg[] = segments.map((s) => ({
    id: s.id,
    start: s.start,
    end: s.end,
    durationSec: Math.max(0, s.end - s.start),
    zh: s.zh,
    // Fallback to literal if polish dropped a segment — never lose a line.
    vi: (polished.get(s.id) ?? literal.get(s.id) ?? '').trim(),
  }));

  return { segments: out, notes: pass2.notes ?? '' };
}
