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
import {
  compareProductBinding,
  extractBinding,
  isFallbackSource,
  isOwnerValid,
  isSourceApproved,
  resolveCleanSourceRel,
} from './production-gates';

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
    sourceMode?: string | null;
    productionAllowed?: boolean | null;
  };
  lastError?: string | null;
}

/**
 * Validate that the global active Product Card matches the job's bound Product Card
 */
export function validateJobProductBinding(
  jobId: string,
  expectedProduct?: { shortLink?: string; shopId?: string; itemId?: string },
): JobProductBindingCheck {
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
  const ownerValid = isOwnerValid(jobCard);
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

  // Compare bindings with expectedProduct (Explicit Context).
  // SSOT: compareProductBinding default-deny khi thiếu expectedProduct.
  const jobBinding = extractBinding(jobCard);
  const idMatch = compareProductBinding(jobBinding, expectedProduct);

  if (!idMatch) {
    issues.push({
      code: 'PRODUCT_JOB_MISMATCH',
      severity: 'blocker',
      message: expectedProduct
        ? `Product Card đang thao tác không khớp với sản phẩm đã bind vào Job hiện tại (${productTitle || 'Không rõ'}).`
        : `Yêu cầu thao tác thiếu context (expectedProduct) để đối chiếu bảo mật với Job hiện tại (${productTitle || 'Không rõ'}).`,
      details: {
        jobProduct: { title: productTitle, ...jobBinding },
        activeProduct: expectedProduct ? extractBinding(expectedProduct) : null,
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
export function validateProductionReadiness(
  jobId: string,
  expectedProduct?: { shortLink?: string; shopId?: string; itemId?: string },
) {
  const issues: WorkflowIntegrityIssue[] = [];
  const productBinding = validateJobProductBinding(jobId, expectedProduct);

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

  // Check cleanliness (Rule 4) — SSOT: isSourceApproved
  const cleanlinessStatus = manifest.source?.cleanlinessStatus ?? null;
  if (!isSourceApproved(cleanlinessStatus)) {
    issues.push({
      code: 'SOURCE_NOT_APPROVED',
      severity: 'blocker',
      message: 'Nguồn video chưa được phê duyệt sạch ở Bước 2.',
      details: { cleanlinessStatus },
    });
  }

  // Check if source is fallback/demo source and block production (Rule 5) — SSOT
  if (isFallbackSource(manifest.source)) {
    issues.push({
      code: 'SOURCE_IS_FALLBACK',
      severity: 'blocker',
      message: 'Nguồn hiện tại là fallback mẫu, không được dùng để sản xuất video thật cho sản phẩm này.',
      details: {
        sourceMode: manifest.source?.sourceMode ?? null,
        productionAllowed: manifest.source?.productionAllowed ?? null,
      },
    });
  }

  // Check clean source video file exists & is secure (Rule 1/4) — SSOT
  const cleanSourceRel = resolveCleanSourceRel(jobId, manifest.source);
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
