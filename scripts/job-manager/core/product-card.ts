// Product-card field readers (extracted from scripts/vfos-job-manager.ts —
// God-file anatomy Nhịp 1). Read-only helpers over an already-persisted
// product_card.json — KHÔNG resolve/fetch Shopee ở đây.

export function extractProductName(productCard: Record<string, unknown>): string | null {
  for (const key of ['name', 'productName', 'title']) {
    const val = productCard[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return null;
}

export function extractProductId(productCard: Record<string, unknown>): string | null {
  for (const key of ['id', 'productId', 'itemId']) {
    const val = productCard[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
    if (typeof val === 'number') return String(val);
  }
  return null;
}

// Đọc tên tìm kiếm tiếng Trung đã persist trong product card (do Studio promote
// suy luận cục bộ). Chỉ ĐỌC field có sẵn — KHÔNG tự suy luận ở đây. Display-only,
// KHÔNG phải nguồn sự thật cho productBinding.
export function extractChineseSearchName(productCard: Record<string, unknown>): string | null {
  const val = productCard.chineseSearchName;
  return typeof val === 'string' && val.trim() ? val.trim() : null;
}
