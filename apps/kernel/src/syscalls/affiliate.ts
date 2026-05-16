import { z } from 'zod';
import type { SyscallSpec } from '../syscall-registry.js';

interface Product {
  sku: string;
  marketplace: 'shopee' | 'tiktok_shop';
  title_vi: string;
  keywords: readonly string[];
  price_vnd: number;
  commission_rate: number;
  affiliate_link: string;
}

const MOCK_CATALOG: readonly Product[] = [
  {
    sku: 'SP-EARBUDS-001',
    marketplace: 'shopee',
    title_vi: 'Tai nghe Bluetooth không dây chống ồn',
    keywords: ['tai nghe', 'bluetooth', 'earbuds', 'wireless', 'audio'],
    price_vnd: 299_000,
    commission_rate: 0.12,
    affiliate_link: 'https://shp.ee/example?aff=demo-tag&sku=SP-EARBUDS-001',
  },
  {
    sku: 'TT-MASK-014',
    marketplace: 'tiktok_shop',
    title_vi: 'Mặt nạ dưỡng da Hàn Quốc combo 10 miếng',
    keywords: ['mặt nạ', 'skincare', 'beauty', 'korea', 'mask'],
    price_vnd: 149_000,
    commission_rate: 0.18,
    affiliate_link: 'https://vt.tiktok.com/example?aff=demo-tag&sku=TT-MASK-014',
  },
  {
    sku: 'SP-KETTLE-220',
    marketplace: 'shopee',
    title_vi: 'Ấm đun nước siêu tốc 1.8L inox',
    keywords: ['ấm đun', 'kettle', 'kitchen', 'đồ gia dụng'],
    price_vnd: 419_000,
    commission_rate: 0.08,
    affiliate_link: 'https://shp.ee/example?aff=demo-tag&sku=SP-KETTLE-220',
  },
];

const MatchInput = z.object({
  transcript: z.string().min(1),
  top_k: z.number().int().positive().max(5).default(1),
});

function scoreProduct(p: Product, text: string): number {
  const lower = text.toLowerCase();
  let hits = 0;
  for (const kw of p.keywords) {
    if (lower.includes(kw.toLowerCase())) hits += 1;
  }
  return hits / p.keywords.length;
}

export const affiliateMatchSku: SyscallSpec = {
  name: 'affiliate.match_sku',
  description: 'Match a video transcript to the best affiliate SKU (mock catalog).',
  requiredScope: 'affiliate.read',
  handler: async (_ctx, raw) => {
    const args = MatchInput.parse(raw);
    const ranked = MOCK_CATALOG.map((p) => ({ product: p, score: scoreProduct(p, args.transcript) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, args.top_k);
    return {
      matches: ranked.map((r) => ({
        sku: r.product.sku,
        marketplace: r.product.marketplace,
        title_vi: r.product.title_vi,
        price_vnd: r.product.price_vnd,
        commission_rate: r.product.commission_rate,
        affiliate_link: r.product.affiliate_link,
        confidence: Number(r.score.toFixed(3)),
      })),
      total: ranked.length,
    };
  },
};
