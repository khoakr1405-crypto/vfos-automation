/* GET /api/studio/channels — UI Architecture V1 Phase D, READ-ONLY.
 * Trả danh sách kênh từ config/channels.json (nguồn thật, không secret) qua
 * growth-data adapter; fixture chỉ khi config trống. pageAccessConfigured là
 * boolean hiện diện env — không bao giờ chứa giá trị token. Không side effect. */

import { loadChannelsWithSource } from '@/lib/growth-data/load';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { channels, source } = loadChannelsWithSource();
  return Response.json({ ok: true, source, channels });
}
