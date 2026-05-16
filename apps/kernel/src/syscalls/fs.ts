import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { assets } from '@vfos/db';
import type { DbHandle } from '../db/client.js';
import { withTenant } from '../db/tenant-context.js';
import type { BlobStore } from '../storage/blob.js';
import type { SyscallSpec } from '../syscall-registry.js';

export interface FsSyscallDeps {
  db: DbHandle;
  blob: BlobStore;
}

const PutInput = z.object({
  mime: z.string().min(1),
  content: z.string(),
  encoding: z.enum(['utf8', 'base64']).default('utf8'),
  tags: z.array(z.string()).default([]),
});

const GetInput = z.object({
  asset_id: z.string().min(1),
});

export function makeFsSyscalls(deps: FsSyscallDeps): readonly SyscallSpec[] {
  const fsPut: SyscallSpec = {
    name: 'fs.put',
    description: 'Store a content-addressed asset (Drizzle + blob storage, RLS-enforced).',
    requiredScope: 'fs.write',
    handler: async (ctx, raw) => {
      const args = PutInput.parse(raw);
      const buf = Buffer.from(args.content, args.encoding);
      const hash = createHash('sha256').update(buf).digest('hex');

      return withTenant(deps.db, ctx.tenant_id, async (tx) => {
        // RLS limits this query to the caller's tenant; no explicit WHERE
        // tenant_id needed.
        const existing = await tx
          .select({ asset_id: assets.asset_id, size: assets.size })
          .from(assets)
          .where(eq(assets.hash, hash))
          .limit(1);

        if (existing[0]) {
          return { asset_id: existing[0].asset_id, deduped: true, bytes: existing[0].size };
        }

        await deps.blob.put(ctx.tenant_id, hash, buf);
        const asset_id = `ast_${hash.slice(0, 24)}`;
        // RLS WITH CHECK enforces tenant_id matches the GUC.
        await tx.insert(assets).values({
          asset_id,
          tenant_id: ctx.tenant_id,
          hash,
          mime: args.mime,
          size: buf.length,
          tags: args.tags,
        });
        return { asset_id, deduped: false, bytes: buf.length };
      });
    },
  };

  const fsGet: SyscallSpec = {
    name: 'fs.get',
    description: 'Retrieve an asset by id (RLS-enforced, tenant-scoped).',
    requiredScope: 'fs.read',
    handler: async (ctx, raw) => {
      const args = GetInput.parse(raw);
      return withTenant(deps.db, ctx.tenant_id, async (tx) => {
        const rows = await tx
          .select()
          .from(assets)
          .where(eq(assets.asset_id, args.asset_id))
          .limit(1);
        const rec = rows[0];
        if (!rec) throw new Error(`asset not found: ${args.asset_id}`);
        const content = await deps.blob.get(rec.tenant_id, rec.hash);
        return {
          asset_id: rec.asset_id,
          mime: rec.mime,
          size: rec.size,
          tags: rec.tags,
          content_base64: content.toString('base64'),
        };
      });
    },
  };

  return [fsPut, fsGet];
}
