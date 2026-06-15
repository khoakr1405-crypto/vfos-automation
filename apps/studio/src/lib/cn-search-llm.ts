/* =============================================================================
 * VFOS Studio — Chinese search-keyword LLM enrich (hybrid layer 2, SERVER ONLY)
 * -----------------------------------------------------------------------------
 * Khi dictionary (cn-search-keywords) không cho kết quả MẠNH: gọi Anthropic bằng raw
 * fetch (KHÔNG thêm @anthropic-ai/sdk) làm 2 bước có ngữ nghĩa:
 *   (1) RÚT GỌN tên dài → cụm lõi tiếng Việt (loại sp + đối tượng + 1 thông số đặc trưng)
 *   (2) DỊCH cụm lõi → 1 cụm DANH TỪ tiếng Trung sát nghĩa (áo chống nắng = 防晒衣,
 *       KHÔNG ra 防晒/防晒霜).
 * Trả về {coreVi, zh}. Pure I/O: apiKey/model do route truyền vào (route đọc .env).
 * TUYỆT ĐỐI không log/echo apiKey. Chỉ gửi TÊN sản phẩm (text marketing public) —
 * không canonical/credential/secret.
 * ========================================================================== */

export const DEFAULT_CN_MODEL = 'claude-haiku-4-5-20251001';

export type LlmEnrichReason = 'NO_API_KEY' | 'EMPTY_NAME' | 'API_ERROR' | 'INVALID_OUTPUT';

export interface LlmEnrichResult {
  ok: boolean;
  /** Cụm từ khóa tìm kiếm tiếng Trung (danh từ sản phẩm, sát nghĩa). */
  keyword?: string;
  /** Cụm lõi tiếng Việt đã rút gọn (để hiển thị "Từ khóa lõi VI"). */
  coreVi?: string;
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
  'Bạn nhận TÊN sản phẩm Shopee tiếng Việt (thường dài, nhiều từ marketing).',
  'Làm 2 bước rồi trả về DUY NHẤT một JSON object:',
  '1) "vi": rút gọn thành CỤM LÕI tiếng Việt — loại sản phẩm + đối tượng + tối đa 1',
  'thông số đặc trưng (vd UPF50). Bỏ chất liệu, từ quảng cáo, cân nặng, mã SKU, mô tả lặp.',
  '2) "zh": dịch CỤM LÕI đó sang tiếng Trung — MỘT cụm DANH TỪ tìm kiếm ngắn để tìm trên',
  'Douyin/1688, GIỮ ĐÚNG loại sản phẩm (vd áo chống nắng = 防晒衣, KHÔNG phải 防晒 hay 防晒霜).',
  'Giữ đối tượng nếu rõ (trẻ em/bé = 儿童). Tối đa khoảng 12 ký tự Hán.',
  'CHỈ trả JSON {"vi":"...","zh":"..."} — không giải thích, không markdown, không xuống dòng thừa.',
].join(' ');

/**
 * Parse output JSON {vi, zh} từ model (chịu được fence ```json). Validate zh qua
 * isValidChineseKeyword + coreVi ngắn không xuống dòng. Trả null nếu không hợp lệ.
 * Pure — KHÔNG kiểm tra feature-only (việc đó do route làm qua isWeakChineseKeyword).
 */
export function parseLlmKeywordJson(text: string): { coreVi: string; zh: string } | null {
  const t = (text ?? '')
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  let parsed: { vi?: unknown; zh?: unknown };
  try {
    parsed = JSON.parse(t) as { vi?: unknown; zh?: unknown };
  } catch {
    return null;
  }
  const coreVi = typeof parsed.vi === 'string' ? parsed.vi.trim() : '';
  const zh = typeof parsed.zh === 'string' ? parsed.zh.trim() : '';
  if (!isValidChineseKeyword(zh)) return null;
  if (!coreVi || coreVi.length > 60 || /[\n\r]/.test(coreVi)) return null;
  return { coreVi, zh };
}

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
        max_tokens: 96,
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

  const parsed = parseLlmKeywordJson(text);
  if (!parsed) return { ok: false, reason: 'INVALID_OUTPUT' };
  return { ok: true, keyword: parsed.zh, coreVi: parsed.coreVi };
}
