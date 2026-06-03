import { toCtaReadinessSummary } from '@/lib/growth-data/cta-readiness';
import { loadAffiliateCtaPlans } from '@/lib/growth-data/load';
import { loadPublishQueueItems } from '@/lib/studio-data/jobs';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const items = loadPublishQueueItems();

    // Round Affiliate Hub 03 — đính kèm readiness CTA theo jobId tại API boundary.
    // Giữ studio-data/jobs.ts thuần (real jobs); merge mock CTA plan ở đây.
    const ctaPlanByJobId = new Map(loadAffiliateCtaPlans().map((p) => [p.jobId, p]));
    const enriched = items.map((item) => {
      const plan = ctaPlanByJobId.get(item.jobId);
      return { ...item, ctaReadiness: plan ? toCtaReadinessSummary(plan) : null };
    });

    return NextResponse.json({
      success: true,
      items: enriched,
      source: 'real',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'FAILED_TO_LOAD_PUBLISH_QUEUE',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
