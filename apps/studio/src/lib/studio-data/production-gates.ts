/* =============================================================================
 * VFOS Studio — Production Gate Standard (Single Source of Truth)
 * -----------------------------------------------------------------------------
 * SERVER ONLY. Gom 5 luật production gate về một nơi duy nhất để UI/API/CLI
 * không drift. Mọi nơi cần kiểm gate phải dùng các primitive ở đây thay vì
 * viết lại biểu thức `sourceMode === 'fallback'` / so khớp binding rải rác.
 *
 * 5 LUẬT BẮT BUỘC:
 *   1. Không có Dev/Readiness PASS thì không được Production.
 *   2. Không có Operator Approve thì không được Publish.
 *   3. Không có Product Binding PASS thì không được Render/Publish.
 *   4. Không có Source thật đã duyệt/sạch thì không được Production.
 *   5. Fallback source chỉ dùng review/dev, không được approve/publish/launch.
 *
 * GHI CHÚ "Dev PASS" (Operator decision round này):
 *   Dev PASS = automated production readiness pass. KHÔNG persist devPassStatus
 *   trong round này. Readiness được tính lại mỗi lần gọi (an toàn hơn cờ tồn).
 *
 * GHI CHÚ RANH GIỚI SCRIPTS:
 *   File này dùng resolveInsideRepo (Next app). Các script tsx ở `scripts/`
 *   (vfos-job-manager, job-launch-check) KHÔNG import file này để tránh kéo
 *   nguồn apps/studio qua ranh giới workspace; chúng nhân bản đúng predicate
 *   `isFallbackSource` (one-liner) và tham chiếu file này làm spec canonical.
 * ========================================================================== */

import { existsSync, readFileSync } from 'node:fs';
import { resolveInsideRepo } from './paths';

export const EXPECTED_OWNER = 'an_17376660568';
export const CLEANLINESS_PASS = 'WATERMARK_NOT_DETECTED';
const JOBS_ROOT_REL = 'data/temp/jobs';

/** Standardized gate keys — dùng chung cho mọi stage. */
export const PRODUCTION_GATE_KEYS = {
  DEV_READINESS_NOT_PASSED: 'DEV_READINESS_NOT_PASSED',
  OPERATOR_APPROVAL_REQUIRED: 'OPERATOR_APPROVAL_REQUIRED',
  PRODUCT_BINDING_MISMATCH: 'PRODUCT_BINDING_MISMATCH',
  PRODUCT_BINDING_MISSING: 'PRODUCT_BINDING_MISSING',
  OWNER_INVALID: 'OWNER_INVALID',
  REAL_SOURCE_REQUIRED: 'REAL_SOURCE_REQUIRED',
  SOURCE_IS_FALLBACK: 'SOURCE_IS_FALLBACK',
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
} as const;

export type ProductionGateKey =
  (typeof PRODUCTION_GATE_KEYS)[keyof typeof PRODUCTION_GATE_KEYS];

export type GateStage = 'production' | 'publish' | 'launch' | 'approve';
export type GateSeverity = 'blocker' | 'error' | 'warn' | 'info';

export interface ProductRef {
  shortLink?: string | null;
  shopId?: string | null;
  itemId?: string | null;
}

export interface ProductBinding {
  shortLink: string;
  shopId: string;
  itemId: string;
}

/** Subset của Product Card cần cho gate (owner + identity). */
export interface GateProductCard {
  affiliateOwnerId?: string | null;
  validationStatus?: string | null;
  shortLink?: string | null;
  shopId?: string | null;
  itemId?: string | null;
  name?: string | null;
}

/** Subset của manifest.source cần cho gate. */
export interface GateSource {
  productCardPath?: string | null;
  sourceVideoPath?: string | null;
  approvedSourceVideoPath?: string | null;
  cleanlinessStatus?: string | null;
  sourceMode?: string | null;
  productionAllowed?: boolean | null;
}

export interface ProductionGate {
  key: ProductionGateKey;
  rule: 1 | 2 | 3 | 4 | 5;
  passed: boolean;
  severity: GateSeverity;
  message: string;
  details?: Record<string, unknown>;
}

export interface ProductionGateResult {
  ok: boolean;
  stage: GateStage;
  jobId: string;
  productTitle: string | null;
  cleanSourceRel: string | null;
  gates: ProductionGate[];
  blockers: ProductionGate[];
}

// ── PRIMITIVES (pure, không đọc fs) ───────────────────────────────────────────

/** Rule 3 (owner side): card phải đúng affiliate owner và đã VERIFIED. */
export function isOwnerValid(card: GateProductCard | null | undefined): boolean {
  return card?.affiliateOwnerId === EXPECTED_OWNER && card?.validationStatus === 'VERIFIED';
}

/**
 * Rule 5: nguồn là fallback/demo. Canonical predicate cho TOÀN repo.
 * Nhận bất kỳ shape nào có `sourceMode` / `productionAllowed` (manifest hoặc DTO).
 */
export function isFallbackSource(
  src: { sourceMode?: string | null; productionAllowed?: boolean | null } | null | undefined,
): boolean {
  if (!src) return false;
  return src.sourceMode === 'fallback' || src.productionAllowed === false;
}

/** Rule 4: nguồn đã được Operator duyệt sạch (watermark not detected). */
export function isSourceApproved(cleanlinessStatus: string | null | undefined): boolean {
  return cleanlinessStatus === CLEANLINESS_PASS;
}

/** Trích identity binding đã trim từ card. */
export function extractBinding(card: GateProductCard | null | undefined): ProductBinding {
  return {
    shortLink: card?.shortLink ? String(card.shortLink).trim() : '',
    shopId: card?.shopId ? String(card.shopId).trim() : '',
    itemId: card?.itemId ? String(card.itemId).trim() : '',
  };
}

/**
 * Rule 3 (binding side): so khớp sản phẩm đang thao tác với binding của job.
 * DEFAULT-DENY: thiếu `expected` (thiếu explicit context) → false.
 */
export function compareProductBinding(
  jobBinding: ProductBinding,
  expected: ProductRef | null | undefined,
): boolean {
  if (!expected) return false;
  const active = extractBinding(expected as GateProductCard);
  return (
    (!!active.shopId &&
      !!active.itemId &&
      active.shopId === jobBinding.shopId &&
      active.itemId === jobBinding.itemId) ||
    (!!active.shortLink && active.shortLink === jobBinding.shortLink)
  );
}

/**
 * Rule 1/4 (file side): tìm file clean source nằm AN TOÀN trong runtime của job.
 * Trả null nếu không có file hợp lệ. Chống path-traversal: chỉ chấp nhận path
 * dưới runs/<jobId>/ hoặc data/temp/jobs/<jobId>/.
 */
export function resolveCleanSourceRel(
  jobId: string,
  src: GateSource | null | undefined,
): string | null {
  const candidates = [
    src?.approvedSourceVideoPath,
    src?.sourceVideoPath,
    `runs/${jobId}/source/clean_source_video.mp4`,
  ];
  for (const rel of candidates) {
    if (!rel || typeof rel !== 'string') continue;
    if (!(rel.startsWith(`runs/${jobId}/`) || rel.startsWith(`${JOBS_ROOT_REL}/${jobId}/`))) {
      continue;
    }
    const abs = resolveInsideRepo(rel);
    if (abs && existsSync(abs)) return rel;
  }
  return null;
}

// ── HIGH-LEVEL: evaluateProductionGates ──────────────────────────────────────

interface GateManifest {
  state?: string;
  source?: GateSource;
  review?: { operatorDecision?: string | null };
}

/** Rule áp dụng cho từng stage. */
const STAGE_RULES: Record<GateStage, ReadonlySet<1 | 2 | 3 | 4 | 5>> = {
  production: new Set([1, 3, 4, 5]),
  publish: new Set([2, 3, 5]),
  launch: new Set([1, 2, 3, 4, 5]),
  approve: new Set([5]),
};

function readJson<T>(rel: string | null | undefined): T | null {
  if (!rel) return null;
  const abs = resolveInsideRepo(rel);
  if (!abs || !existsSync(abs)) return null;
  try {
    return JSON.parse(readFileSync(abs, 'utf8')) as T;
  } catch {
    return null;
  }
}

/**
 * Unified production gate evaluation. Đọc manifest + bound product card của job
 * và chấm 5 luật theo stage. KHÔNG side effect, KHÔNG gọi API, KHÔNG publish.
 */
export function evaluateProductionGates(
  jobId: string,
  opts: { stage: GateStage; expectedProduct?: ProductRef },
): ProductionGateResult {
  const { stage, expectedProduct } = opts;
  const rules = STAGE_RULES[stage];
  const gates: ProductionGate[] = [];

  const fail = (gate: ProductionGate) => gates.push(gate);

  if (!/^[A-Za-z0-9_-]+$/.test(jobId)) {
    return finalize(stage, jobId, null, null, [
      {
        key: PRODUCTION_GATE_KEYS.JOB_NOT_FOUND,
        rule: 1,
        passed: false,
        severity: 'blocker',
        message: `Mã Job ID không hợp lệ: ${jobId}`,
      },
    ]);
  }

  const manifest = readJson<GateManifest>(`${JOBS_ROOT_REL}/${jobId}/job_manifest.json`);
  if (!manifest) {
    return finalize(stage, jobId, null, null, [
      {
        key: PRODUCTION_GATE_KEYS.JOB_NOT_FOUND,
        rule: 1,
        passed: false,
        severity: 'blocker',
        message: `Không tìm thấy manifest của Job: ${jobId}`,
      },
    ]);
  }

  const src = manifest.source ?? null;
  const card = readJson<GateProductCard>(src?.productCardPath);
  const productTitle = card?.name ?? null;
  const jobBinding = extractBinding(card);
  const cleanSourceRel = resolveCleanSourceRel(jobId, src);

  // Rule 5 — fallback (default-deny ở mọi stage có rule 5).
  if (rules.has(5) && isFallbackSource(src)) {
    fail({
      key: PRODUCTION_GATE_KEYS.SOURCE_IS_FALLBACK,
      rule: 5,
      passed: false,
      severity: 'blocker',
      message: 'Nguồn hiện tại là fallback/demo — chỉ dùng review/dev, không được production/publish/launch.',
      details: { sourceMode: src?.sourceMode ?? null, productionAllowed: src?.productionAllowed ?? null },
    });
  }

  // Rule 3 — product binding + owner.
  if (rules.has(3)) {
    if (!card) {
      fail({
        key: PRODUCTION_GATE_KEYS.PRODUCT_BINDING_MISSING,
        rule: 3,
        passed: false,
        severity: 'blocker',
        message: 'Job chưa có Product Card được liên kết (bind).',
      });
    } else {
      if (!isOwnerValid(card)) {
        fail({
          key: PRODUCTION_GATE_KEYS.OWNER_INVALID,
          rule: 3,
          passed: false,
          severity: 'blocker',
          message: 'Product Card của Job sai affiliate owner hoặc chưa VERIFIED.',
          details: {
            affiliateOwnerId: card.affiliateOwnerId ?? null,
            validationStatus: card.validationStatus ?? null,
          },
        });
      }
      if (!compareProductBinding(jobBinding, expectedProduct)) {
        fail({
          key: expectedProduct
            ? PRODUCTION_GATE_KEYS.PRODUCT_BINDING_MISMATCH
            : PRODUCTION_GATE_KEYS.PRODUCT_BINDING_MISSING,
          rule: 3,
          passed: false,
          severity: 'blocker',
          message: expectedProduct
            ? `Product đang thao tác không khớp sản phẩm đã bind vào Job (${productTitle ?? 'Không rõ'}).`
            : `Thiếu context (expectedProduct) để đối chiếu binding với Job (${productTitle ?? 'Không rõ'}).`,
          details: { jobBinding, activeProduct: expectedProduct ?? null },
        });
      }
    }
  }

  // Rule 4 — source thật đã duyệt sạch.
  if (rules.has(4) && !isSourceApproved(src?.cleanlinessStatus)) {
    fail({
      key: PRODUCTION_GATE_KEYS.REAL_SOURCE_REQUIRED,
      rule: 4,
      passed: false,
      severity: 'blocker',
      message: 'Nguồn video chưa được phê duyệt sạch (Bước 2).',
      details: { cleanlinessStatus: src?.cleanlinessStatus ?? null },
    });
  }

  // Rule 1 — Dev/Readiness PASS (clean source file thật đã sẵn để render).
  if (rules.has(1) && !cleanSourceRel) {
    fail({
      key: PRODUCTION_GATE_KEYS.DEV_READINESS_NOT_PASSED,
      rule: 1,
      passed: false,
      severity: 'blocker',
      message: 'Chưa sẵn sàng sản xuất: thiếu file video nguồn sạch trong runtime của Job.',
    });
  }

  // Rule 2 — Operator approve.
  if (rules.has(2) && manifest.review?.operatorDecision !== 'APPROVED') {
    fail({
      key: PRODUCTION_GATE_KEYS.OPERATOR_APPROVAL_REQUIRED,
      rule: 2,
      passed: false,
      severity: 'blocker',
      message: 'Operator chưa phê duyệt Job (operatorDecision phải là APPROVED).',
      details: { operatorDecision: manifest.review?.operatorDecision ?? null },
    });
  }

  return finalize(stage, jobId, productTitle, cleanSourceRel, gates);
}

function finalize(
  stage: GateStage,
  jobId: string,
  productTitle: string | null,
  cleanSourceRel: string | null,
  gates: ProductionGate[],
): ProductionGateResult {
  const blockers = gates.filter((g) => g.severity === 'blocker' || g.severity === 'error');
  return {
    ok: blockers.length === 0,
    stage,
    jobId,
    productTitle,
    cleanSourceRel,
    gates,
    blockers,
  };
}
