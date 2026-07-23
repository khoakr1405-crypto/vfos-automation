/* =============================================================================
 * VFOS Studio — Per-video Shopee sub_id + shared-link collision (G1-A read-side)
 * -----------------------------------------------------------------------------
 * PURE — không fs, không network, không @/ alias (import relative → tsx --test
 * chạy được từ apps/studio/tests). Không side effect.
 *
 * Bối cảnh: attribution quy 1 dòng doanh thu Shopee về job qua shortLink HOẶC
 * itemId (connector.ts). Khi ≥2 video dùng CHUNG 1 shortLink/sản phẩm → 1 dòng
 * CSV khớp nhiều job → 'partial' → tiền KHÔNG quy được về đúng video. Cách tách
 * per-video của Shopee là sub_id. Module này CHỈ lo phần read-side an toàn:
 *   - deriveVideoSubId: sub_id TẤT ĐỊNH cho mỗi video (để Operator đặt khi tạo
 *     link Shopee / hiển thị trên UI).
 *   - detectShortLinkCollisions: chỉ ra video nào đang chung link (cảnh báo).
 * KHÔNG đụng money-parser (connector) và KHÔNG đụng đường publish — đó là G1-B.
 * ========================================================================== */

/** Sub_id cắt tối đa (giới hạn thật của Shopee chưa công bố; cắt phòng jobId dị thường). */
const SUBID_MAX = 50;

/**
 * Sub_id per-video TẤT ĐỊNH cho tracking Shopee: `vfos` + jobId đã BỎ mọi ký tự
 * ngoài [a-zA-Z0-9]. Charset THUẦN CHỮ-SỐ là ràng buộc CỨNG của form Custom Link
 * Shopee VN ("Chỉ được phép nhập giá trị chữ và số (a-z,A-Z, 0-9)" — Operator
 * screenshot 2026-07-23); bản đầu `vfos_<jobId>` có `_` bị Shopee từ chối.
 * Cùng jobId ⇒ cùng sub_id (không random) → đặt 1 lần lúc tạo link, đối chiếu
 * từ report bằng cách DERIVE-rồi-SO với từng job đã đăng (không parse ngược —
 * bỏ separator là mất thông tin chiều ngược). Trả null khi rỗng/không còn ký tự.
 */
export function deriveVideoSubId(jobId: string | null | undefined): string | null {
  const safe = (jobId ?? '').replace(/[^a-zA-Z0-9]/g, '');
  if (!safe) return null;
  return `vfos${safe}`.slice(0, SUBID_MAX);
}

/**
 * Dòng tối thiểu cần để dò đụng attribution. affiliateShortLink + productId phải
 * là ĐÚNG field connector attribute (card.shortLink + card.itemId), KHÔNG phải
 * link hiển thị có fallback productBinding — nếu không cảnh báo sẽ lệch money-parser.
 */
export interface CollisionRow {
  jobId: string;
  affiliateShortLink: string | null;
  productId: string | null;
}

/**
 * Map jobId → danh sách jobId KHÁC "đụng attribution" — chung affiliateShortLink
 * HOẶC chung productId(itemId). Khớp ĐÚNG luật connector (connector.ts: match
 * shortLink OR itemId) → 1 dòng CSV khớp nhiều job = 'partial', tiền không tự quy
 * về đúng video. Union theo cả 2 khoá: A~B qua link, A~C qua item ⇒ A đụng {B,C}.
 * Khoá null/rỗng bỏ qua (chưa có ≠ đụng nhau). Chỉ trả jobId THỰC SỰ đụng (≥2
 * video chung ÍT NHẤT 1 khoá). Deterministic (giữ thứ tự chèn), pure.
 */
export function detectAttributionCollisions(rows: readonly CollisionRow[]): Map<string, string[]> {
  // Gom jobId theo từng khoá attribution (link:… / item:…). 2 video đụng nhau khi
  // chung BẤT KỲ khoá nào.
  const byKey = new Map<string, Set<string>>();
  const add = (key: string, jobId: string): void => {
    const set = byKey.get(key) ?? new Set<string>();
    set.add(jobId);
    byKey.set(key, set);
  };
  for (const r of rows) {
    const link = r.affiliateShortLink ?? '';
    const item = r.productId ?? '';
    // Nhóm theo giá trị RAW (parity với so sánh === không-trim của connector); chỉ
    // dùng trim để BỎ khoá rỗng/toàn khoảng trắng (chưa có ≠ đụng nhau).
    if (link.trim()) add(`link:${link}`, r.jobId);
    if (item.trim()) add(`item:${item}`, r.jobId);
  }
  const out = new Map<string, Set<string>>();
  for (const set of byKey.values()) {
    if (set.size < 2) continue;
    for (const jid of set) {
      const acc = out.get(jid) ?? new Set<string>();
      for (const other of set) if (other !== jid) acc.add(other);
      out.set(jid, acc);
    }
  }
  return new Map([...out].map(([jid, set]) => [jid, [...set]]));
}
