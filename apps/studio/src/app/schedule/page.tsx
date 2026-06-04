import { PageHeader } from '@/components/page-header';
import { HubTaggingGuide } from '@/components/schedule/hub-tagging-guide';
import { PostingPlanSection } from '@/components/schedule/posting-plan-section';
import { Button } from '@/components/ui';
import { type CtaReadinessSummary, toCtaReadinessSummary } from '@/lib/growth-data/cta-readiness';
import {
  loadAffiliateCtaPlans,
  loadChannels,
  loadPostingPlans,
  loadPublishedPosts,
} from '@/lib/growth-data/load';

// Đọc Growth data thật (filesystem fixtures) ở mỗi request — không prerender tĩnh.
export const dynamic = 'force-dynamic';

// biome-ignore lint/style/noDefaultExport: Next.js page requires default export
export default async function SchedulePage() {
  const plans = loadPostingPlans();
  const channels = loadChannels();
  const publishedPosts = loadPublishedPosts();
  const ctaPlans = loadAffiliateCtaPlans();

  // jobId → readiness summary (transport-safe, KHÔNG raw link). Hub 06.
  const ctaByJobId = new Map<string, CtaReadinessSummary>(
    ctaPlans.map((p) => [p.jobId, toCtaReadinessSummary(p)]),
  );

  // Guide chỉ liệt kê những job thực sự có trong lịch đăng (có jobId + có CTA plan).
  const scheduledJobIds = new Set(
    plans.map((p) => p.jobId).filter((id): id is string => id !== null),
  );
  const scheduledSummaries = [...ctaByJobId.values()].filter((s) => scheduledJobIds.has(s.jobId));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 rounded-xl border border-accent-blue/30 bg-accent-blue/10 px-3.5 py-2 text-[11px] text-accent-blue">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-blue" />
        <span>
          <strong>Growth 04 · READ-ONLY.</strong> Lịch đăng đọc <strong>thật</strong> qua
          growth-data adapter (Growth fixtures seed). Badge CTA readiness (Hub 06) đọc từ{' '}
          <strong>AffiliateCtaPlan</strong> — không gọi Facebook API, không tự gắn tag.
        </span>
      </div>

      <PageHeader
        no={11}
        icon="schedule"
        accent="amber"
        title="Lịch đăng / Posting Plan"
        description="Lịch đăng theo kênh/ngách/khung giờ + CTA readiness theo job. Nguồn: Growth data adapter (read-only)."
        actions={
          <Button variant="outline" disabled className="!py-1.5">
            Thêm lịch
          </Button>
        }
      />

      <PostingPlanSection
        plans={plans}
        channels={channels}
        publishedPosts={publishedPosts}
        ctaByJobId={ctaByJobId}
      />

      <HubTaggingGuide summaries={scheduledSummaries} />
    </div>
  );
}
