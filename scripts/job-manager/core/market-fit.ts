// Product-from-Video Loop (Phần 78) — verdict thuần cho khiên Market-Fit.
// LLM (job-product-from-video.ts) trả suggestion; các hàm ở đây validate shape,
// chấm PASS/FAIL và dựng card AUTO_MARKET_FIT. KHÔNG IO — testable.
//
// Mandate Operator: lane Review là VIDEO-FIRST — sản phẩm sinh ra TỪ video tải
// về, và chỉ sản xuất khi LOẠI sản phẩm đó bán được trên TikTok Shop VN. Đây là
// gate tự duyệt (No-Go #8): không nút xác nhận tay, không dán link ở khâu này.
// Giới hạn nói thẳng: fit = phán đoán AI mức LOẠI sản phẩm, KHÔNG phải check
// listing sống trên TikTok Shop (check sống = scraper, để round riêng nếu cần).

export interface MarketFitSuggestion {
  mainProductVisible: boolean;
  /** Tên sản phẩm tiếng Việt kiểu listing TMĐT (3–120 ký tự). */
  productNameVi: string;
  keywords: string[];
  chineseSearchName: string | null;
  category: string;
  /** Sản phẩm vật lý bán lẻ được (không phải dịch vụ/địa điểm/người/nội dung). */
  isPhysicalProduct: boolean;
  /** Loại sản phẩm này có phổ biến trên TikTok Shop / sàn TMĐT VN không. */
  likelyOnTikTokShopVN: boolean;
  confidence: number;
  reason: string;
}

export interface MarketFitVerdict {
  pass: boolean;
  reason: string;
  thresholds: { minConfidence: number };
}

export const MARKET_FIT_MIN_CONFIDENCE = 0.6;

/** Validate JSON thô từ LLM → suggestion typed. Sai shape → null (caller fail loud). */
export function parseMarketFitSuggestion(raw: unknown): MarketFitSuggestion | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const name = typeof o.productNameVi === 'string' ? o.productNameVi.trim() : '';
  if (name.length < 3 || name.length > 120) return null;
  if (typeof o.isPhysicalProduct !== 'boolean') return null;
  if (typeof o.likelyOnTikTokShopVN !== 'boolean') return null;
  const confidence = typeof o.confidence === 'number' ? o.confidence : Number.NaN;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  const keywords = Array.isArray(o.keywords)
    ? o.keywords.filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
    : [];
  return {
    mainProductVisible: o.mainProductVisible !== false,
    productNameVi: name,
    keywords: keywords.slice(0, 8),
    chineseSearchName:
      typeof o.chineseSearchName === 'string' && o.chineseSearchName.trim()
        ? o.chineseSearchName.trim()
        : null,
    category: typeof o.category === 'string' ? o.category.trim() : '',
    isPhysicalProduct: o.isPhysicalProduct,
    likelyOnTikTokShopVN: o.likelyOnTikTokShopVN,
    confidence,
    reason: typeof o.reason === 'string' ? o.reason.trim() : '',
  };
}

/** Chấm PASS/FAIL từ suggestion đã validate. */
export function assessMarketFit(
  s: MarketFitSuggestion,
  minConfidence: number = MARKET_FIT_MIN_CONFIDENCE,
): MarketFitVerdict {
  const thresholds = { minConfidence };
  if (!s.mainProductVisible) {
    return { pass: false, reason: 'Không thấy sản phẩm chính rõ ràng trong video.', thresholds };
  }
  if (!s.isPhysicalProduct) {
    return {
      pass: false,
      reason: `Không phải sản phẩm vật lý bán lẻ được (${s.reason || s.category || 'không rõ'}).`,
      thresholds,
    };
  }
  if (!s.likelyOnTikTokShopVN) {
    return {
      pass: false,
      reason: `Loại sản phẩm khó có mặt trên TikTok Shop VN: ${s.reason || s.category}`,
      thresholds,
    };
  }
  if (s.confidence < minConfidence) {
    return {
      pass: false,
      reason: `Độ tin cậy nhận dạng quá thấp (${s.confidence} < ${minConfidence}).`,
      thresholds,
    };
  }
  return {
    pass: true,
    reason:
      s.reason || `Sản phẩm "${s.productNameVi}" thuộc loại bán phổ biến trên TikTok Shop VN.`,
    thresholds,
  };
}

/** Card AUTO_MARKET_FIT — platform tiktok-shop, KHÔNG link (link = khâu affiliate sau). */
export function buildAutoMarketFitCard(
  s: MarketFitSuggestion,
  verdict: MarketFitVerdict,
  jobId: string,
  createdAt: string,
): Record<string, unknown> {
  return {
    platform: 'tiktok-shop',
    id: `auto_tt_${jobId}`,
    name: s.productNameVi,
    keywords: s.keywords,
    chineseSearchName: s.chineseSearchName,
    category: s.category || null,
    source: 'auto_market_fit_vision',
    validationStatus: 'AUTO_MARKET_FIT',
    dataConfidence: 'low',
    marketFit: {
      likelyOnTikTokShopVN: s.likelyOnTikTokShopVN,
      confidence: s.confidence,
      reason: verdict.reason,
      minConfidence: verdict.thresholds.minConfidence,
    },
    createdAt,
  };
}
