/* =============================================================================
 * VFOS Studio — Chinese search-keyword LLM enrich (hybrid layer 2, SERVER ONLY)
 * -----------------------------------------------------------------------------
 * Fallback khi dictionary (cn-search-keywords) MISS: gọi Anthropic bằng raw fetch
 * (KHÔNG thêm @anthropic-ai/sdk) để TRÍCH 1 cụm từ khóa tiếng Trung NGẮN (loại sản
 * phẩm + đặc tính), KHÔNG dịch nguyên câu. Pure I/O: apiKey/model do route truyền
 * vào (route đọc .env). TUYỆT ĐỐI không log/echo apiKey. Chỉ gửi TÊN sản phẩm
 * (text marketing public) — không canonical/credential/secret.
 * ========================================================================== */

export const DEFAULT_CN_MODEL = 'claude-haiku-4-5-20251001';

export type LlmEnrichReason = 'NO_API_KEY' | 'EMPTY_NAME' | 'API_ERROR' | 'INVALID_OUTPUT';

export interface LlmEnrichResult {
  ok: boolean;
  keyword?: string;
  reason?: LlmEnrichReason;
}

// Ký tự Hán (CJK): Ext-A + CJK Unified + Compatibility. Khớp range hasCJK dùng ở UI.
function hasCJK(s: string): boolean {
  return /[㐀-䶿一-鿿豈-﫿]/.test(s);
}

/**
 * Output hợp lệ: có ký tự Hán, độ dài hợp lý (1..24 sau trim), KHÔNG phải câu Latin
 * dài / có giải thích. Chống model trả nguyên câu, markdown, hay xuống dòng.
 */
export function isValidChineseKeyword(raw: string): boolean {
  const s = (raw || '').trim();
  if (s.length === 0 || s.length > 24) return false;
  if (!hasCJK(s)) return false;
  if (/[\n\r]/.test(s)) return false;
  if (/[.!?。！？,，;；]/.test(s)) return false; // dấu câu → câu/giải thích, không phải từ khóa
  // Cho phép tối đa 2 cụm Latin (vd mã "U8", "3L"); nhiều hơn = câu tiếng Anh.
  const latinWords = s.match(/[A-Za-z]{2,}/g) ?? [];
  if (latinWords.length > 2) return false;
  return true;
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const SYSTEM_PROMPT = [
  'Bạn trích TỪ KHÓA TÌM KIẾM tiếng Trung cho một sản phẩm, để tìm video/sản phẩm',
  'trên Douyin/1688. Chỉ trả về DUY NHẤT một cụm từ khóa tiếng Trung NGẮN GỌN',
  '(loại sản phẩm + đặc tính chính). KHÔNG dịch nguyên câu, KHÔNG giải thích,',
  'KHÔNG thêm dấu câu, KHÔNG xuống dòng. Tối đa khoảng 10 ký tự Hán.',
].join(' ');

/**
 * Gọi Anthropic Messages API bằng raw fetch. Trả keyword đã validate hoặc reason.
 * KHÔNG log/echo apiKey; không throw ra ngoài (mọi lỗi → reason). max_tokens thấp.
 */
export async function enrichChineseNameViaLLM(
  name: string,
  opts: { apiKey: string; model: string },
): Promise<LlmEnrichResult> {
  const productName = (name || '').trim();
  if (!productName) return { ok: false, reason: 'EMPTY_NAME' };
  if (!opts.apiKey) return { ok: false, reason: 'NO_API_KEY' };

  let text = '';
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: 32,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: productName }],
      }),
    });
    if (!res.ok) return { ok: false, reason: 'API_ERROR' };
    const data = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
    text = (data.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
      .trim();
  } catch {
    return { ok: false, reason: 'API_ERROR' };
  }

  if (!isValidChineseKeyword(text)) return { ok: false, reason: 'INVALID_OUTPUT' };
  return { ok: true, keyword: text };
}
