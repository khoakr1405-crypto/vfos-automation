import { setTimeout as sleep } from 'node:timers/promises';
import { ulid } from 'ulid';
import type {
  ConnectorMode,
  PlatformConnector,
  PublishRequest,
  PublishResponse,
} from './types.js';

// Content Posting API endpoints (Sandbox + Production share the host).
// Docs: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
const TIKTOK_API = 'https://open.tiktokapis.com';

export class TikTokConnector implements PlatformConnector {
  readonly platform = 'tiktok' as const;
  readonly mode: ConnectorMode;

  constructor(mode: ConnectorMode = 'mock') {
    this.mode = mode;
  }

  async publish(req: PublishRequest): Promise<PublishResponse> {
    if (this.mode === 'mock') {
      // Simulate the multi-step TikTok publish path: init upload → poll → publish.
      await sleep(80);
      const publishId = `tt_${ulid()}`;
      return {
        publish_id: publishId,
        platform: 'tiktok',
        status: 'published',
        url: `https://www.tiktok.com/@${req.account_id}/video/${publishId}`,
        raw: { mock: true, account_id: req.account_id, caption_len: req.caption.length },
      };
    }
    return this.publishLive(req);
  }

  private async publishLive(req: PublishRequest): Promise<PublishResponse> {
    if (!req.video_url) {
      throw new Error('tiktok live publish requires video_url (PULL_FROM_URL source)');
    }
    const initBody = {
      post_info: {
        title: req.caption,
        privacy_level: mapPrivacy(req.privacy),
        disable_comment: false,
        disable_duet: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: req.video_url,
      },
    };
    const initRes = await fetch(`${TIKTOK_API}/v2/post/publish/video/init/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${req.access_token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(initBody),
    });
    const initJson = (await initRes.json()) as {
      data?: { publish_id?: string };
      error?: { code?: string; message?: string };
    };
    if (!initRes.ok || initJson.error?.code) {
      throw new Error(
        `tiktok init failed: ${initRes.status} ${initJson.error?.message ?? 'unknown'}`,
      );
    }
    const publishId = initJson.data?.publish_id;
    if (!publishId) throw new Error('tiktok init: missing publish_id');
    return {
      publish_id: publishId,
      platform: 'tiktok',
      status: 'queued',
      raw: initJson as Record<string, unknown>,
    };
  }
}

function mapPrivacy(privacy: PublishRequest['privacy']): string {
  switch (privacy) {
    case 'public':
      return 'PUBLIC_TO_EVERYONE';
    case 'unlisted':
      return 'MUTUAL_FOLLOW_FRIENDS';
    case 'private':
      return 'SELF_ONLY';
    default:
      return 'SELF_ONLY';
  }
}
