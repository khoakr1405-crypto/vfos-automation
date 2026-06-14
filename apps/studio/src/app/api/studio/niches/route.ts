/* GET /api/studio/niches — Niche → Channel → Job (North Star #3), READ-ONLY.
 * Trả danh sách ngách từ config/niches.json (nguồn thật, không secret) qua
 * growth-data adapter; fixture chỉ khi config trống. Không side effect. */

import { loadNichesWithSource } from '@/lib/growth-data/load';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { niches, source } = loadNichesWithSource();
  return Response.json({ ok: true, source, niches });
}
