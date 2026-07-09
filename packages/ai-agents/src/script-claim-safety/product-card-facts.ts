// Product-card facts reader — di trú từ scripts/job-manager/commands/script.ts
// (name reader L95–100 + price logic L102–110). Zero behavior change.
//
// LƯU Ý layering: packages/ KHÔNG import scripts/core → replicate name-scan
// (3 key: name/productName/title) thay vì import extractProductName của core.
// Việc gate MISSING_PRODUCT_NAME (exit 4) vẫn nằm ở command (Phase 3), reader
// này chỉ đọc — trả productName rỗng nếu card thiếu, để caller tự quyết.

import type { ScriptFacts } from './types.js';

export function extractProductName(card: Record<string, unknown>): string | null {
  for (const key of ['name', 'productName', 'title']) {
    const val = card[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return null;
}

export function readScriptFacts(card: Record<string, unknown>): ScriptFacts {
  const productName = extractProductName(card);
  const priceRaw = card.price ?? card.price_min ?? card.priceMin;
  const priceLabel =
    typeof priceRaw === 'number'
      ? priceRaw >= 1000
        ? `${Math.round(priceRaw / 1000)}K`
        : `${priceRaw}`
      : typeof priceRaw === 'string'
        ? priceRaw
        : null;
  return { productName: productName ?? '', priceLabel };
}
