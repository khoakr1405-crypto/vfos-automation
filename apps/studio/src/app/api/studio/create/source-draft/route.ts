/* =============================================================================
 * VFOS Studio — Create source URL draft (Studio Create Source 01)
 * -----------------------------------------------------------------------------
 * Local-only runtime persistence for the Step 2 "Nguồn video" URL the operator
 * types in /create. Saves to a gitignored runtime file so a page refresh keeps
 * the draft. Reuses the audited guard pattern from manual-performance/save:
 * local-only host check + findSensitiveTerms() secret scan + resolveInsideRepo()
 * path safety + sanitized response. NO job creation, NO download, NO network
 * fetch of the URL, NO Shopee/Douyin/TikTok/Facebook API, NO publish, NO shell.
 * ========================================================================== */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { findSensitiveTerms } from '@/lib/growth-data/manual-input';
import { resolveInsideRepo } from '@/lib/studio-data/paths';

export const dynamic = 'force-dynamic';

const DRAFT_REL = 'data/temp/studio/create_source_draft.json';
const CARD_REL = 'data/temp/selected_product_card.json';
const MAX_URL_LEN = 3000;
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

/** Sanitized product info from the current Product Card — never canonical/credential. */
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

function writeDraftAtomic(draft: SourceDraft): boolean {
  const abs = resolveInsideRepo(DRAFT_REL);
  if (!abs) return false;
  try {
    mkdirSync(dirname(abs), { recursive: true });
    const tmp = `${abs}.tmp.${process.pid}.${Date.now()}`;
    writeFileSync(tmp, JSON.stringify(draft, null, 2), 'utf8');
    renameSync(tmp, abs);
    return true;
  } catch {
    return false;
  }
}

export function GET(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json(
      { ok: false, code: 'NOT_LOCAL', message: 'Chỉ cho phép đọc từ local dev.' },
      { status: 403 },
    );
  }
  return Response.json({ ok: true, draft: readDraft() });
}

export async function POST(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json(
      { ok: false, code: 'NOT_LOCAL', message: 'Chỉ cho phép lưu từ local dev.' },
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

  // Secret scan TRƯỚC khi xử lý — KHÔNG log payload thô.
  const sensitive = findSensitiveTerms(JSON.stringify(body ?? ''));
  if (sensitive.length > 0) {
    return Response.json(
      {
        ok: false,
        code: 'SENSITIVE_REJECTED',
        message: 'Payload chứa trường nhạy cảm — từ chối lưu.',
        fields: sensitive,
      },
      { status: 400 },
    );
  }

  const o = (body ?? {}) as { sourceKind?: unknown; sourceUrl?: unknown };
  if (o.sourceKind !== 'url') {
    return Response.json(
      { ok: false, code: 'BAD_KIND', message: 'sourceKind phải là "url".' },
      { status: 400 },
    );
  }

  const url = (typeof o.sourceUrl === 'string' ? o.sourceUrl : '').trim();
  if (url === '') {
    return Response.json(
      { ok: false, code: 'EMPTY_URL', message: 'sourceUrl không được rỗng.' },
      { status: 400 },
    );
  }
  if (url.length > MAX_URL_LEN) {
    return Response.json(
      { ok: false, code: 'URL_TOO_LONG', message: 'sourceUrl quá dài.' },
      { status: 400 },
    );
  }
  // No network validation — scheme check only. Never fetch the URL.
  if (!/^https?:\/\//i.test(url)) {
    return Response.json(
      { ok: false, code: 'BAD_URL', message: 'URL phải bắt đầu bằng http:// hoặc https://.' },
      { status: 400 },
    );
  }

  const draft: SourceDraft = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    product: readCurrentProduct(),
    source: { kind: 'url', url, status: 'DRAFT' },
  };

  if (!writeDraftAtomic(draft)) {
    return Response.json(
      { ok: false, code: 'WRITE_FAILED', message: 'Không ghi được runtime draft.' },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, draft });
}

export async function DELETE(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json(
      { ok: false, code: 'NOT_LOCAL', message: 'Chỉ cho phép xoá từ local dev.' },
      { status: 403 },
    );
  }
  const abs = resolveInsideRepo(DRAFT_REL);
  if (abs && existsSync(abs)) {
    try {
      unlinkSync(abs);
    } catch {
      return Response.json(
        { ok: false, code: 'DELETE_FAILED', message: 'Không xoá được runtime draft.' },
        { status: 500 },
      );
    }
  }
  return Response.json({ ok: true, draft: null });
}
