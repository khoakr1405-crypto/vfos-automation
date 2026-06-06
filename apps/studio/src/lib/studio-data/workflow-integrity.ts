/* =============================================================================
 * VFOS Studio — Workflow Integrity Standard & Guards
 * -----------------------------------------------------------------------------
 * SERVER ONLY. Các hàm kiểm tra tính toàn vẹn (integrity) của workflow:
 *   - validateJobProductBinding: Đối chiếu Product Card đang chọn ở Hành động 1
 *     với Product Card snapshot của Job đang chạy ở Hành động 2.
 *   - validateProductionReadiness: Kiểm tra đầy đủ điều kiện chạy sản xuất
 *     (Product Card khớp, owner hợp lệ, nguồn video đã duyệt sạch).
 * ========================================================================== */

import { existsSync, readFileSync } from 'node:fs';
import { resolveInsideRepo } from './paths';

export type WorkflowIntegrityStatus = 'PASS' | 'MISSING' | 'MISMATCH' | 'BLOCKED';

export interface WorkflowIntegrityIssue {
  code: string;
  severity: 'info' | 'warn' | 'error' | 'blocker';
  message: string;
  details?: Record<string, unknown>;
}

export interface JobProductBindingCheck {
  ok: boolean;
  status: WorkflowIntegrityStatus;
  jobId: string;
  productTitle?: string | null;
  productCardPath?: string | null;
  issues: WorkflowIntegrityIssue[];
}

const EXPECTED_OWNER = 'an_17376660568';
const JOBS_ROOT_REL = 'data/temp/jobs';
const SELECTED_CARD_REL = 'data/temp/selected_product_card.json';

interface ProductCard {
  affiliateOwnerId?: string | null;
  validationStatus?: string | null;
  shortLink?: string | null;
  shopId?: string | null;
  itemId?: string | null;
  name?: string | null;
}

interface JobManifest {
  jobId: string;
  state?: string;
  source?: {
    productCardPath?: string | null;
    sourceVideoPath?: string | null;
    approvedSourceVideoPath?: string | null;
    cleanlinessStatus?: string | null;
    sourceVideoUrl?: string | null;
  };
  lastError?: string | null;
}

/**
 * Validate that the global active Product Card matches the job's bound Product Card
 */
export function validateJobProductBinding(jobId: string): JobProductBindingCheck {
  const issues: WorkflowIntegrityIssue[] = [];

  const manifestRel = `${JOBS_ROOT_REL}/${jobId}/job_manifest.json`;
  const manifestAbs = resolveInsideRepo(manifestRel);
  if (!manifestAbs || !existsSync(manifestAbs)) {
    return {
      ok: false,
      status: 'MISSING',
      jobId,
      issues: [
        {
          code: 'MANIFEST_MISSING',
          severity: 'blocker',
          message: `Không tìm thấy file manifest của Job ID: ${jobId}`,
        },
      ],
    };
  }

  let manifest: JobManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestAbs, 'utf8'));
  } catch {
    return {
      ok: false,
      status: 'BLOCKED',
      jobId,
      issues: [
        {
          code: 'MANIFEST_UNREADABLE',
          severity: 'blocker',
          message: 'Không thể đọc file manifest của Job.',
        },
      ],
    };
  }

  const cardRel = manifest.source?.productCardPath;
  const cardAbs = cardRel ? resolveInsideRepo(cardRel) : null;
  if (!cardRel || !cardAbs || !existsSync(cardAbs)) {
    return {
      ok: false,
      status: 'MISSING',
      jobId,
      productCardPath: cardRel ?? null,
      issues: [
        {
          code: 'PRODUCT_BINDING_MISSING',
          severity: 'blocker',
          message: 'Job chưa có Product Card được liên kết (bind).',
        },
      ],
    };
  }

  let jobCard: ProductCard;
  try {
    jobCard = JSON.parse(readFileSync(cardAbs, 'utf8'));
  } catch {
    return {
      ok: false,
      status: 'BLOCKED',
      jobId,
      productCardPath: cardRel,
      issues: [
        {
          code: 'PRODUCT_BINDING_UNREADABLE',
          severity: 'blocker',
          message: 'Không đọc được file Product Card liên kết của Job.',
        },
      ],
    };
  }

  const productTitle = jobCard.name ?? null;

  // Owner validation of the job's snapshot card
  const ownerValid =
    jobCard.affiliateOwnerId === EXPECTED_OWNER && jobCard.validationStatus === 'VERIFIED';
  if (!ownerValid) {
    issues.push({
      code: 'OWNER_INVALID',
      severity: 'blocker',
      message: 'Product Card của Job sai affiliate owner hoặc chưa được xác thực (VERIFIED).',
      details: {
        affiliateOwnerId: jobCard.affiliateOwnerId,
        validationStatus: jobCard.validationStatus,
      },
    });
  }

  // Load the current active selected card (global selection at Action 1)
  const selectedAbs = resolveInsideRepo(SELECTED_CARD_REL);
  if (!selectedAbs || !existsSync(selectedAbs)) {
    return {
      ok: issues.length === 0,
      status: 'MISMATCH',
      jobId,
      productTitle,
      productCardPath: cardRel,
      issues: [
        ...issues,
        {
          code: 'ACTIVE_CARD_MISSING',
          severity: 'error',
          message: 'Chưa chọn Product Card hoạt động tại Hành động 1.',
        },
      ],
    };
  }

  let selectedCard: ProductCard;
  try {
    selectedCard = JSON.parse(readFileSync(selectedAbs, 'utf8'));
  } catch {
    return {
      ok: false,
      status: 'BLOCKED',
      jobId,
      productTitle,
      productCardPath: cardRel,
      issues: [
        ...issues,
        {
          code: 'ACTIVE_CARD_UNREADABLE',
          severity: 'blocker',
          message: 'Không thể đọc Product Card hoạt động hiện tại.',
        },
      ],
    };
  }

  // Compare bindings
  const jobBinding = {
    shortLink: jobCard.shortLink ? String(jobCard.shortLink).trim() : '',
    shopId: jobCard.shopId ? String(jobCard.shopId).trim() : '',
    itemId: jobCard.itemId ? String(jobCard.itemId).trim() : '',
  };

  const activeBinding = {
    shortLink: selectedCard.shortLink ? String(selectedCard.shortLink).trim() : '',
    shopId: selectedCard.shopId ? String(selectedCard.shopId).trim() : '',
    itemId: selectedCard.itemId ? String(selectedCard.itemId).trim() : '',
  };

  const idMatch =
    (!!activeBinding.shopId &&
      !!activeBinding.itemId &&
      activeBinding.shopId === jobBinding.shopId &&
      activeBinding.itemId === jobBinding.itemId) ||
    (!!activeBinding.shortLink && activeBinding.shortLink === jobBinding.shortLink);

  if (!idMatch) {
    issues.push({
      code: 'PRODUCT_JOB_MISMATCH',
      severity: 'blocker',
      message: `Product Card đang chọn ở Hành động 1 không khớp với sản phẩm đã bind vào Job hiện tại (${productTitle || 'Không rõ'}).`,
      details: {
        jobProduct: { title: productTitle, ...jobBinding },
        activeProduct: { title: selectedCard.name ?? null, ...activeBinding },
      },
    });

    return {
      ok: false,
      status: 'MISMATCH',
      jobId,
      productTitle,
      productCardPath: cardRel,
      issues,
    };
  }

  return {
    ok: issues.length === 0,
    status: 'PASS',
    jobId,
    productTitle,
    productCardPath: cardRel,
    issues,
  };
}

/**
 * Perform a full validation check on the job readiness for production.
 */
export function validateProductionReadiness(jobId: string) {
  const issues: WorkflowIntegrityIssue[] = [];
  const productBinding = validateJobProductBinding(jobId);

  // Collect product binding issues
  issues.push(...productBinding.issues);

  // Load manifest for other checks
  const manifestRel = `${JOBS_ROOT_REL}/${jobId}/job_manifest.json`;
  const manifestAbs = resolveInsideRepo(manifestRel);
  if (!manifestAbs || !existsSync(manifestAbs)) {
    return {
      ok: false,
      jobId,
      issues,
      productBinding,
    };
  }

  let manifest: JobManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestAbs, 'utf8'));
  } catch {
    return {
      ok: false,
      jobId,
      issues,
      productBinding,
    };
  }

  // Check cleanliness
  const cleanlinessStatus = manifest.source?.cleanlinessStatus ?? null;
  if (cleanlinessStatus !== 'WATERMARK_NOT_DETECTED') {
    issues.push({
      code: 'SOURCE_NOT_APPROVED',
      severity: 'blocker',
      message: 'Nguồn video chưa được phê duyệt sạch ở Bước 2.',
      details: { cleanlinessStatus },
    });
  }

  // Check source video file exists and is secure
  const candidateRels = [
    manifest.source?.approvedSourceVideoPath,
    manifest.source?.sourceVideoPath,
    `runs/${jobId}/source/clean_source_video.mp4`,
  ];
  let cleanSourceRel: string | null = null;
  for (const rel of candidateRels) {
    if (!rel || typeof rel !== 'string') continue;
    // Security check: must reside inside runs/<jobId>/ or data/temp/jobs/<jobId>/
    if (!(rel.startsWith(`runs/${jobId}/`) || rel.startsWith(`${JOBS_ROOT_REL}/${jobId}/`))) {
      continue;
    }
    const abs = resolveInsideRepo(rel);
    if (abs && existsSync(abs)) {
      cleanSourceRel = rel;
      break;
    }
  }

  if (!cleanSourceRel) {
    issues.push({
      code: 'CLEAN_SOURCE_MISSING',
      severity: 'blocker',
      message: 'Không tìm thấy file video nguồn sạch cục bộ trong job runtime.',
    });
  }

  return {
    ok: issues.filter((iss) => iss.severity === 'blocker' || iss.severity === 'error').length === 0,
    jobId,
    issues,
    productBinding,
    cleanSourceRel,
  };
}
