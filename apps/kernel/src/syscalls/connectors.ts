import { SpanKind } from '@opentelemetry/api';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { platform_credentials } from '@vfos/db';
import type { EventBus } from '../bus/types.js';
import type { ConnectorRegistry } from '../connectors/registry.js';
import { decryptToken, encryptToken } from '../connectors/envelope.js';
import type { PlatformName } from '../connectors/types.js';
import type { DbHandle } from '../db/client.js';
import { withTenant } from '../db/tenant-context.js';
import type { SyscallSpec } from '../syscall-registry.js';
import { instruments } from '../telemetry/instruments.js';
import { withSpan } from '../telemetry/tracer.js';

export interface ConnectorsSyscallDeps {
  db: DbHandle;
  bus: EventBus;
  connectors: ConnectorRegistry;
  credentialKey: string;
}

const PLATFORMS = ['tiktok', 'facebook', 'instagram', 'youtube', 'threads'] as const;
const PLATFORM_ENUM = z.enum(PLATFORMS);

const LinkInput = z.object({
  platform: PLATFORM_ENUM,
  account_id: z.string().min(1),
  handle: z.string().optional(),
  access_token: z.string().min(8),
  refresh_token: z.string().optional(),
  expires_at: z.string().datetime().optional(),
  scopes: z.array(z.string()).default([]),
  meta: z.record(z.unknown()).default({}),
});

const ListInput = z.object({
  platform: PLATFORM_ENUM.optional(),
  include_revoked: z.boolean().default(false),
});

const UnlinkInput = z.object({
  id: z.string().uuid(),
});

const PublishInput = z.object({
  account_id: z.string().min(1),
  caption: z.string().min(1).max(2200),
  hashtags: z.array(z.string()).default([]),
  privacy: z.enum(['public', 'unlisted', 'private']).default('private'),
  video_url: z.string().url().optional(),
  asset_id: z.string().optional(),
});

function redact(row: typeof platform_credentials.$inferSelect): Record<string, unknown> {
  return {
    id: row.id,
    platform: row.platform,
    account_id: row.account_id,
    handle: row.handle,
    scopes: row.scopes,
    meta: row.meta,
    has_refresh_token: row.refresh_token_enc !== null,
    expires_at: row.expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_used_at: row.last_used_at,
    revoked_at: row.revoked_at,
  };
}

async function loadActiveCredential(
  db: DbHandle,
  tenant_id: string,
  platform: PlatformName,
  account_id: string,
): Promise<typeof platform_credentials.$inferSelect | null> {
  return withTenant(db, tenant_id, async (tx) => {
    const rows = await tx
      .select()
      .from(platform_credentials)
      .where(
        and(
          eq(platform_credentials.platform, platform),
          eq(platform_credentials.account_id, account_id),
          isNull(platform_credentials.revoked_at),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  });
}

async function runPublish(
  deps: ConnectorsSyscallDeps,
  platform: PlatformName,
  ctx: { tenant_id: string; trace_id: string; caller: string },
  raw: unknown,
): Promise<Record<string, unknown>> {
  const args = PublishInput.parse(raw);
  if (!args.video_url && !args.asset_id) {
    throw new Error('publish requires either video_url or asset_id');
  }
  const cred = await loadActiveCredential(deps.db, ctx.tenant_id, platform, args.account_id);
  if (!cred) {
    throw new Error(`no active credential: ${platform}/${args.account_id}`);
  }
  const connector = deps.connectors.get(platform);
  const accessToken = decryptToken(cred.access_token_enc, deps.credentialKey);
  const m = instruments();
  const start = performance.now();
  const result = await withSpan(
    `publish.${platform}`,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        'vfos.publish.platform': platform,
        'vfos.publish.mode': connector.mode,
        'vfos.publish.account_id': args.account_id,
        'vfos.publish.privacy': args.privacy,
        'vfos.tenant_id': ctx.tenant_id,
      },
    },
    async (span) => {
      try {
        const publishReq = {
          account_id: args.account_id,
          access_token: accessToken,
          caption: args.caption,
          hashtags: args.hashtags,
          privacy: args.privacy,
          ...(args.video_url ? { video_url: args.video_url } : {}),
          ...(args.asset_id ? { asset_id: args.asset_id } : {}),
        };
        const res = await connector.publish(publishReq);
        const ms = Math.round(performance.now() - start);
        m.publish_total.add(1, {
          platform,
          mode: connector.mode,
          status: res.status,
        });
        m.publish_duration_ms.record(ms, { platform, mode: connector.mode });
        span.setAttributes({
          'vfos.publish.id': res.publish_id,
          'vfos.publish.status': res.status,
        });
        await withTenant(deps.db, ctx.tenant_id, async (tx) => {
          await tx
            .update(platform_credentials)
            .set({ last_used_at: new Date() })
            .where(eq(platform_credentials.id, cred.id));
        });
        await deps.bus.publish({
          schema: 'publish.completed.v1',
          tenant_id: ctx.tenant_id,
          emitter: `kernel:publish.${platform}`,
          trace_id: ctx.trace_id,
          payload: {
            platform,
            account_id: args.account_id,
            publish_id: res.publish_id,
            status: res.status,
            url: res.url ?? null,
          },
        });
        return { ...res, ms };
      } catch (err) {
        const ms = Math.round(performance.now() - start);
        m.publish_total.add(1, {
          platform,
          mode: connector.mode,
          status: 'failed',
        });
        m.publish_duration_ms.record(ms, { platform, mode: connector.mode });
        const message = err instanceof Error ? err.message : String(err);
        await deps.bus.publish({
          schema: 'publish.failed.v1',
          tenant_id: ctx.tenant_id,
          emitter: `kernel:publish.${platform}`,
          trace_id: ctx.trace_id,
          payload: {
            platform,
            account_id: args.account_id,
            error: message,
          },
        });
        throw err;
      }
    },
  );
  return result as unknown as Record<string, unknown>;
}

export function makeConnectorsSyscalls(deps: ConnectorsSyscallDeps): readonly SyscallSpec[] {
  const link: SyscallSpec = {
    name: 'connectors.link',
    description: 'Store an OAuth credential for a platform account (encrypted at rest).',
    requiredScope: 'tenant.admin',
    handler: async (ctx, raw) => {
      const args = LinkInput.parse(raw);
      const accessEnc = encryptToken(args.access_token, deps.credentialKey);
      const refreshEnc = args.refresh_token
        ? encryptToken(args.refresh_token, deps.credentialKey)
        : null;
      const expires = args.expires_at ? new Date(args.expires_at) : null;
      return withTenant(deps.db, ctx.tenant_id, async (tx) => {
        const existing = await tx
          .select({ id: platform_credentials.id })
          .from(platform_credentials)
          .where(
            and(
              eq(platform_credentials.platform, args.platform),
              eq(platform_credentials.account_id, args.account_id),
            ),
          )
          .limit(1);
        if (existing[0]) {
          await tx
            .update(platform_credentials)
            .set({
              handle: args.handle ?? null,
              access_token_enc: accessEnc,
              refresh_token_enc: refreshEnc,
              expires_at: expires,
              scopes: args.scopes,
              meta: args.meta,
              updated_at: new Date(),
              revoked_at: null,
            })
            .where(eq(platform_credentials.id, existing[0].id));
          const updated = await tx
            .select()
            .from(platform_credentials)
            .where(eq(platform_credentials.id, existing[0].id))
            .limit(1);
          return { credential: redact(updated[0]!), action: 'updated' as const };
        }
        const inserted = await tx
          .insert(platform_credentials)
          .values({
            tenant_id: ctx.tenant_id,
            platform: args.platform,
            account_id: args.account_id,
            handle: args.handle ?? null,
            access_token_enc: accessEnc,
            refresh_token_enc: refreshEnc,
            expires_at: expires,
            scopes: args.scopes,
            meta: args.meta,
          })
          .returning();
        return { credential: redact(inserted[0]!), action: 'created' as const };
      });
    },
  };

  const list: SyscallSpec = {
    name: 'connectors.list',
    description: 'List platform credentials for the caller tenant (secrets redacted).',
    requiredScope: 'tenant.read',
    handler: async (ctx, raw) => {
      const args = ListInput.parse(raw);
      return withTenant(deps.db, ctx.tenant_id, async (tx) => {
        // Order by updated_at DESC so the most recently linked/refreshed
        // credential surfaces first. This matters when stale rows (encrypted
        // with a previous VFOS_CREDENTIAL_KEY) would otherwise dominate.
        const rows = await tx
          .select()
          .from(platform_credentials)
          .orderBy(desc(platform_credentials.updated_at));
        const filtered = rows.filter((r) => {
          if (args.platform && r.platform !== args.platform) return false;
          if (!args.include_revoked && r.revoked_at !== null) return false;
          return true;
        });
        return { credentials: filtered.map(redact) };
      });
    },
  };

  const unlink: SyscallSpec = {
    name: 'connectors.unlink',
    description: 'Revoke a stored credential by id.',
    requiredScope: 'tenant.admin',
    handler: async (ctx, raw) => {
      const args = UnlinkInput.parse(raw);
      return withTenant(deps.db, ctx.tenant_id, async (tx) => {
        const rows = await tx
          .update(platform_credentials)
          .set({ revoked_at: new Date(), updated_at: new Date() })
          .where(eq(platform_credentials.id, args.id))
          .returning({ id: platform_credentials.id });
        if (rows.length === 0) throw new Error(`credential not found: ${args.id}`);
        return { id: rows[0]!.id, revoked: true };
      });
    },
  };

  const publishTikTok: SyscallSpec = {
    name: 'publish.tiktok',
    description: 'Publish a video to TikTok via Content Posting API.',
    requiredScope: 'publish.write',
    handler: (ctx, raw) => runPublish(deps, 'tiktok', ctx, raw),
  };

  const publishFacebookReel: SyscallSpec = {
    name: 'publish.facebook.reels',
    description: 'Publish a Reel to a Facebook Page via Graph API.',
    requiredScope: 'publish.write',
    handler: (ctx, raw) => runPublish(deps, 'facebook', ctx, raw),
  };

  return [link, list, unlink, publishTikTok, publishFacebookReel];
}
