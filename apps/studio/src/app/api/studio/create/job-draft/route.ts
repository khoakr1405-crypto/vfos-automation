/* =============================================================================
 * VFOS Studio — Create job draft (Studio Create Job 01)
 * -----------------------------------------------------------------------------
 * Local-only runtime endpoint for Step 3 "Kiểm tra nguồn & Tạo job" in /create.
 * Validates confirmPhrase, reads product card & source draft, executes
 * "pnpm job:create" script, associates the source draft URL, updates the manifest
 * and registry, and cleans up the draft.
 * ========================================================================== */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { findSensitiveTerms } from '@/lib/growth-data/manual-input';
import { resolveInsideRepo } from '@/lib/studio-data/paths';
import { runRepoScript } from '@/lib/studio-data/run-command';

export const dynamic = 'force-dynamic';

const CARD_REL = 'data/temp/selected_product_card.json';
const DRAFT_REL = 'data/temp/studio/create_source_draft.json';
const REGISTRY_REL = 'data/temp/vfos_jobs_registry.json';
const JOBS_ROOT_REL = 'data/temp/jobs';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host);
}

interface DraftProduct {
  shortLink: string;
  shopid: string;
  itemid: string;
  productName: string;
}

interface SourceDraft {
  schemaVersion: 1;
  updatedAt: string;
  product: DraftProduct | null;
  source: { kind: 'url'; url: string; status: 'DRAFT' };
}

function readDraft(): SourceDraft | null {
  const abs = resolveInsideRepo(DRAFT_REL);
  if (!abs || !existsSync(abs)) return null;
  try {
    return JSON.parse(readFileSync(abs, 'utf8')) as SourceDraft;
  } catch {
    return null;
  }
}

function readCurrentProduct(): DraftProduct | null {
  const abs = resolveInsideRepo(CARD_REL);
  if (!abs || !existsSync(abs)) return null;
  try {
    const c = JSON.parse(readFileSync(abs, 'utf8')) as Record<string, unknown>;
    return {
      shortLink: String(c.shortLink ?? ''),
      shopid: String(c.shopId ?? ''),
      itemid: String(c.itemId ?? ''),
      productName: String(c.name ?? ''),
    };
  } catch {
    return null;
  }
}

interface RegistryEntry {
  jobId: string;
  runId: string;
  state: string;
  productName: string | null;
  productCardPath: string;
  sourceVideoPath: string | null;
  captionedPreviewPath: string | null;
  operatorDecision: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  updatedAt: string;
  sourceVideoUrl?: string;
}

interface Registry {
  registryVersion: 'v1';
  updatedAt: string;
  jobs: RegistryEntry[];
}

function loadRegistry(absPath: string): Registry {
  if (!existsSync(absPath)) {
    return { registryVersion: 'v1', updatedAt: new Date().toISOString(), jobs: [] };
  }
  try {
    const raw = JSON.parse(readFileSync(absPath, 'utf8')) as Registry;
    if (!raw.registryVersion) raw.registryVersion = 'v1';
    if (!Array.isArray(raw.jobs)) raw.jobs = [];
    return raw;
  } catch {
    return { registryVersion: 'v1', updatedAt: new Date().toISOString(), jobs: [] };
  }
}

function saveRegistry(absPath: string, reg: Registry): void {
  mkdirSync(dirname(absPath), { recursive: true });
  reg.updatedAt = new Date().toISOString();
  writeFileSync(absPath, `${JSON.stringify(reg, null, 2)}\n`, 'utf8');
}

function upsertRegistryEntry(reg: Registry, entry: RegistryEntry): void {
  const idx = reg.jobs.findIndex((j) => j.jobId === entry.jobId);
  if (idx >= 0) {
    reg.jobs[idx] = entry;
  } else {
    reg.jobs.push(entry);
  }
}

export async function POST(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json(
      { ok: false, code: 'NOT_LOCAL', message: 'Chỉ cho phép tạo job từ local dev.' },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { ok: false, code: 'BAD_JSON', message: 'Payload không phải JSON hợp lệ.' },
      { status: 400 },
    );
  }

  // Scan for sensitive terms in input
  const sensitive = findSensitiveTerms(JSON.stringify(body ?? ''));
  if (sensitive.length > 0) {
    return Response.json(
      {
        ok: false,
        code: 'SENSITIVE_REJECTED',
        message: 'Payload chứa trường nhạy cảm — từ chối xử lý.',
        fields: sensitive,
      },
      { status: 400 },
    );
  }

  const o = (body ?? {}) as { confirmPhrase?: unknown };
  if (o.confirmPhrase !== 'CREATE JOB') {
    return Response.json(
      {
        ok: false,
        code: 'INVALID_CONFIRM_PHRASE',
        message: 'Xác nhận tạo job không chính xác. Phải nhập "CREATE JOB".',
      },
      { status: 400 },
    );
  }

  // 1. Verify Product Card exists
  const currentProduct = readCurrentProduct();
  if (!currentProduct) {
    return Response.json(
      { ok: false, code: 'MISSING_PRODUCT_CARD', message: 'Không tìm thấy Product Card hiện tại.' },
      { status: 400 },
    );
  }

  // 2. Verify Source Draft exists
  const draft = readDraft();
  if (!draft || !draft.source || !draft.source.url) {
    return Response.json(
      {
        ok: false,
        code: 'MISSING_SOURCE_DRAFT',
        message: 'Không tìm thấy nguồn video nháp ở Bước 2.',
      },
      { status: 400 },
    );
  }

  // 3. Verify Product matches draft
  const matches =
    draft.product &&
    (draft.product.shortLink === currentProduct.shortLink ||
      (draft.product.shopid === currentProduct.shopid &&
        draft.product.itemid === currentProduct.itemid));

  if (!matches) {
    return Response.json(
      {
        ok: false,
        code: 'PRODUCT_MISMATCH',
        message:
          'Nguồn nháp đã lưu không khớp với Product Card hiện tại. Vui lòng lưu lại nguồn nháp ở Bước 2.',
      },
      { status: 400 },
    );
  }

  // Validate draft URL
  const sourceUrl = draft.source.url.trim();
  if (!/^https?:\/\//i.test(sourceUrl)) {
    return Response.json(
      { ok: false, code: 'BAD_URL', message: 'URL video nguồn nháp không hợp lệ.' },
      { status: 400 },
    );
  }

  // 4. Run `pnpm job:create --from-product data/temp/selected_product_card.json`
  const cardAbs = resolveInsideRepo(CARD_REL);
  if (!cardAbs) {
    return Response.json(
      { ok: false, code: 'INTERNAL_ERROR', message: 'Không xác định được đường dẫn Product Card.' },
      { status: 500 },
    );
  }

  console.log('[API] Running pnpm job:create via runRepoScript...');
  const spawnRes = runRepoScript('scripts/vfos-job-manager.ts', [
    'create',
    '--from-product',
    CARD_REL,
  ]);

  if (spawnRes.status !== 0) {
    console.error('[API] job:create script execution failed:', spawnRes.stderr);
    return Response.json(
      {
        ok: false,
        code: 'SCRIPT_EXEC_FAILED',
        message: 'Không chạy được script tạo Job.',
        stderr: spawnRes.stderr,
      },
      { status: 500 },
    );
  }

  const stdout = spawnRes.stdout || '';
  const match = stdout.match(/Job ID:\s+(job_\d{8}_\d{3})/);
  if (!match) {
    console.error('[API] Could not parse Job ID from stdout:', stdout);
    return Response.json(
      {
        ok: false,
        code: 'PARSING_FAILED',
        message: 'Tạo Job thành công nhưng không parse được Job ID từ stdout.',
        stdout,
      },
      { status: 500 },
    );
  }

  const jobId = match[1];
  console.log(`[API] Successfully created job: ${jobId}`);

  // 5. Update Manifest with draft source URL
  const manifestRel = `${JOBS_ROOT_REL}/${jobId}/job_manifest.json`;
  const manifestAbs = resolveInsideRepo(manifestRel);
  if (!manifestAbs || !existsSync(manifestAbs)) {
    return Response.json(
      {
        ok: false,
        code: 'MANIFEST_NOT_FOUND',
        message: `Không tìm thấy file manifest cho Job vừa tạo: ${jobId}`,
      },
      { status: 500 },
    );
  }

  try {
    const manifest = JSON.parse(readFileSync(manifestAbs, 'utf8'));
    manifest.source = manifest.source || {};
    manifest.source.sourceVideoUrl = sourceUrl;
    manifest.updatedAt = new Date().toISOString();
    writeFileSync(manifestAbs, JSON.stringify(manifest, null, 2), 'utf8');

    // 6. Update Registry entry with updated manifest state
    const registryAbs = resolveInsideRepo(REGISTRY_REL);
    if (registryAbs) {
      const reg = loadRegistry(registryAbs);
      const entry: RegistryEntry = {
        jobId: manifest.jobId,
        runId: manifest.runId,
        state: manifest.state,
        productName: currentProduct.productName,
        productCardPath: manifest.source.productCardPath,
        sourceVideoPath: manifest.source.sourceVideoPath || null,
        captionedPreviewPath: manifest.artifacts?.captionedPreviewPath || null,
        operatorDecision: manifest.review?.operatorDecision || 'PENDING',
        createdAt: manifest.createdAt,
        updatedAt: manifest.updatedAt,
      };
      entry.sourceVideoUrl = sourceUrl;

      upsertRegistryEntry(reg, entry);
      saveRegistry(registryAbs, reg);
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[API] Failed to update job manifest/registry with source URL:', err);
    return Response.json(
      {
        ok: false,
        code: 'UPDATE_FAILED',
        message: 'Lưu Job thành công nhưng thất bại khi cập nhật URL nguồn vào manifest/registry.',
        error: errMsg,
      },
      { status: 500 },
    );
  }

  // 7. Cleanup the draft source url file
  try {
    const draftAbs = resolveInsideRepo(DRAFT_REL);
    if (draftAbs && existsSync(draftAbs)) {
      unlinkSync(draftAbs);
      console.log('[API] Cleaned up source draft file.');
    }
  } catch (err) {
    console.warn('[API] Warning: failed to delete source draft file:', err);
  }

  return Response.json({
    ok: true,
    jobId,
    status: 'WAITING_FOR_SOURCE_VIDEO',
    product: {
      name: currentProduct.productName,
      shortLink: currentProduct.shortLink,
      shopid: currentProduct.shopid,
      itemid: currentProduct.itemid,
    },
    source: {
      kind: 'url',
      url: sourceUrl,
      status: 'DRAFT',
    },
    createdAt: new Date().toISOString(),
  });
}
