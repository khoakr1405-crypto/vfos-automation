/* =============================================================================
 * VFOS Studio — Chinese product search-keyword builder (Action 1 enrichment)
 * -----------------------------------------------------------------------------
 * Suy ra cụm TỪ KHÓA tìm kiếm tiếng Trung SÁT NGHĨA từ tên sản phẩm Shopee tiếng
 * Việt, để Operator copy đi tìm đúng sản phẩm/video trên Douyin / Taobao / 1688.
 *
 * KHÔNG gọi translate API (VFOS No-Go Rule). Đây là ánh xạ cục bộ deterministic.
 * Nguyên tắc SÁT NGHĨA:
 *  - Ưu tiên loại sản phẩm cụ thể + đặc tính (chống gù, thoáng khí) + độ tuổi.
 *  - Nếu CHỈ match được category rộng (背带/包/灯…) → KHÔNG output đại → trả null
 *    ("Chưa có tên Trung sát nghĩa").
 * Chỉ phục vụ hiển thị/tìm source — KHÔNG phải nguồn sự thật cho job binding.
 * ========================================================================== */

type Entry = readonly [vi: string, zh: string];

/** Bỏ dấu tiếng Việt + đ→d + lowercase (lowercase TRƯỚC để fold cả Đ hoa). */
function foldVi(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd');
}

// Loại sản phẩm CỤ THỂ (sát nghĩa). Cụm dài đứng trước để claim trước token con.
const NOUN_SPECIFIC: readonly Entry[] = [
  ['diu em so sinh', '婴儿腰凳'],
  ['diu em be', '婴儿腰凳'],
  ['diu em', '婴儿腰凳'],
  ['noi chien khong dau', '空气炸锅'],
  ['noi chien', '空气炸锅'],
  ['noi com dien', '电饭煲'],
  ['may hut bui', '吸尘器'],
  ['may xay sinh to', '破壁机'],
  ['may xay', '搅拌机'],
  ['may say toc', '吹风机'],
  ['gia do dien thoai', '手机支架'],
  ['camera hanh trinh', '行车记录仪'],
  ['ghe an dam', '宝宝餐椅'],
  ['binh giu nhiet', '保温杯'],
  ['cay lau nha', '拖把'],
  ['mu bao hiem', '头盔'],
  ['tai nghe', '耳机'],
  ['cap sac', '数据线'],
  ['ta bim', '纸尿裤'],
  ['binh sua', '奶瓶'],
  ['xe day', '婴儿车'],
  ['den led', 'LED灯'],
];

// Đặc tính phân biệt (sát nghĩa). Không xóa khỏi chuỗi — là token độc lập.
const FEATURE: readonly Entry[] = [
  ['chong gu', '防驼背'],
  ['chong tran', '防溢'],
  ['chong nuoc', '防水'],
  ['chong nang', '防晒'],
  ['gap gon', '可折叠'],
  ['da nang', '多功能'],
];

// Category RỘNG (chỉ ra nhóm, KHÔNG đủ sát nghĩa nếu đứng một mình).
const NOUN_BROAD: readonly Entry[] = [
  ['diu', '背带'],
  ['noi', '锅'],
  ['chao', '炒锅'],
  ['den', '灯'],
  ['quat', '风扇'],
  ['tui', '包'],
  ['balo', '背包'],
  ['coc', '杯子'],
  ['dao', '刀'],
  ['dien thoai', '手机'],
  ['dong ho', '手表'],
  ['kinh', '眼镜'],
];

/**
 * Suy ra cụm từ khóa tiếng Trung SÁT NGHĨA từ tên VI. Trả null nếu không đủ sát
 * nghĩa (chỉ match category rộng / không match gì).
 */
export function buildChineseSearchName(viName: string): string | null {
  if (!viName) return null;
  const original = foldVi(viName);
  let working = original;

  const collect = (dict: readonly Entry[], removeMatched: boolean): string[] => {
    const out: string[] = [];
    for (const [vi, zh] of dict) {
      if (working.includes(vi)) {
        if (!out.includes(zh)) out.push(zh);
        if (removeMatched) working = working.split(vi).join(' ');
      }
    }
    return out;
  };

  const nounsSpecific = collect(NOUN_SPECIFIC, true);
  const features = collect(FEATURE, false);

  const ageMatch = original.match(/(\d+)\s*-\s*(\d+)\s*tuoi/);
  const age = ageMatch ? [`${ageMatch[1]}-${ageMatch[2]}岁`] : [];

  // Compound đặc thù: "thoáng khí" + sản phẩm địu → 透气背带 (thay vì 透气 rời).
  const isCarrier = /(^|\s)diu(\s|$)/.test(original) || nounsSpecific.includes('婴儿腰凳');
  const breathable = original.includes('thoang khi');
  const compound: string[] = [];
  if (breathable && isCarrier) {
    compound.push('透气背带');
  } else if (breathable) {
    features.push('透气');
  }

  const nounsBroad = collect(NOUN_BROAD, false);

  // Gate sát nghĩa: cần ≥1 cụm cụ thể (specific noun / feature / age / compound).
  const hasSpecific =
    nounsSpecific.length > 0 || features.length > 0 || age.length > 0 || compound.length > 0;
  if (!hasSpecific) return null;

  const seen = new Set<string>();
  const parts: string[] = [];
  for (const p of [...nounsSpecific, ...features, ...age, ...compound, ...nounsBroad]) {
    if (p.length > 0 && !seen.has(p)) {
      seen.add(p);
      parts.push(p);
    }
  }
  return parts.length > 0 ? parts.join(' ') : null;
}
