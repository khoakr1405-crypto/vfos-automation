/* GET /api/studio/overview — Round UI-02 read-only.
 * Aggregate job summary + product rows (derive từ job thật). KHÔNG side effect. */
import { loadOverviewSummary, loadProductRows } from '@/lib/studio-data/jobs';

export const dynamic = 'force-dynamic';

export function GET() {
  try {
    const summary = loadOverviewSummary();
    const products = loadProductRows();
    return Response.json({
      source: 'real',
      ...summary,
      products,
      // Các panel dưới đây vẫn là mock trong UI-02 (analytics/cluster/weekly).
      mock: {
        analytics: true,
        clusterSummary: true,
        weeklyActivity: true,
        publishReadinessMatrix: true,
        kpiGrid: true,
      },
    });
  } catch {
    return Response.json(
      {
        source: 'real',
        activeLane: 'Review sản phẩm',
        total: 0,
        byState: {},
        products: [],
        error: 'OVERVIEW_READ_FAILED',
      },
      { status: 200 },
    );
  }
}
