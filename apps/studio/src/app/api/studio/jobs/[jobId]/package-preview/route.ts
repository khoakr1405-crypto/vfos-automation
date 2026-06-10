import { readJobTextFile } from '@/lib/studio-data/jobs';

export const dynamic = 'force-dynamic';

const JOB_ID_RE = /^[A-Za-z0-9_-]+$/;

export async function GET(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await ctx.params;

    if (!JOB_ID_RE.test(jobId)) {
      return Response.json(
        { ok: false, code: 'BAD_JOB_ID', message: 'Mã Job ID không hợp lệ.' },
        { status: 400 },
      );
    }

    const caption = readJobTextFile(jobId, 'caption.txt');
    const hashtags = readJobTextFile(jobId, 'hashtags.txt');

    // Read and parse package_manifest.json
    let packageManifest: Record<string, unknown> | null = null;
    const packageManifestContent = readJobTextFile(jobId, 'package_manifest.json');
    if (packageManifestContent) {
      try {
        packageManifest = JSON.parse(packageManifestContent) as Record<string, unknown>;
      } catch {
        // Fallback safely if JSON parse fails
      }
    }

    // Read and parse product_card.json to extract the shortLink/canonicalUrl and product details
    let productCard: Record<string, unknown> | null = null;
    const productCardContent = readJobTextFile(jobId, 'product_card.json');
    if (productCardContent) {
      try {
        productCard = JSON.parse(productCardContent) as Record<string, unknown>;
      } catch {
        // Fallback safely
      }
    }

    const affiliateLink = productCard?.shortLink || productCard?.canonicalUrl || null;
    const productName = productCard?.name || null;
    const pageName = process.env.FACEBOOK_PAGE_NAME || null;

    return Response.json({
      ok: true,
      jobId,
      caption: caption ? caption.trim() : null,
      hashtags: hashtags ? hashtags.trim() : null,
      affiliateLink,
      productName,
      pageName,
      packageManifest,
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        code: 'INTERNAL_SERVER_ERROR',
        message: err instanceof Error ? err.message : 'Lỗi hệ thống khi đọc gói đóng gói.',
      },
      { status: 500 },
    );
  }
}
