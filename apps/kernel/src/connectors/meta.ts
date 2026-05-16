import { setTimeout as sleep } from 'node:timers/promises';
import { ulid } from 'ulid';
import type {
  ConnectorMode,
  PlatformConnector,
  PlatformName,
  PublishRequest,
  PublishResponse,
} from './types.js';

// Meta Graph API for Reels publishing.
// Docs: https://developers.facebook.com/docs/video-api/guides/reels-publishing
const META_GRAPH = 'https://graph.facebook.com/v21.0';

interface MetaConnectorOpts {
  platform?: PlatformName;
  mode?: ConnectorMode;
}

export class MetaConnector implements PlatformConnector {
  readonly platform: PlatformName;
  readonly mode: ConnectorMode;

  constructor(opts: MetaConnectorOpts = {}) {
    this.platform = opts.platform ?? 'facebook';
    this.mode = opts.mode ?? 'mock';
  }

  async publish(req: PublishRequest): Promise<PublishResponse> {
    if (this.mode === 'mock') {
      await sleep(80);
      const publishId = `fb_${ulid()}`;
      return {
        publish_id: publishId,
        platform: this.platform,
        status: 'published',
        url: `https://www.facebook.com/reel/${publishId}`,
        raw: { mock: true, page_id: req.account_id, caption_len: req.caption.length },
      };
    }
    return this.publishLive(req);
  }

  private async publishLive(req: PublishRequest): Promise<PublishResponse> {
    if (!req.video_url) {
      throw new Error('meta live publish requires video_url');
    }
    // Step 1: init container (upload_phase=start, source URL).
    const initUrl = new URL(`${META_GRAPH}/${req.account_id}/video_reels`);
    initUrl.searchParams.set('upload_phase', 'start');
    initUrl.searchParams.set('access_token', req.access_token);
    const initRes = await fetch(initUrl.toString(), { method: 'POST' });
    const initJson = (await initRes.json()) as {
      video_id?: string;
      error?: { message?: string };
    };
    if (!initRes.ok || initJson.error) {
      throw new Error(`meta init failed: ${initRes.status} ${initJson.error?.message ?? '?'}`);
    }
    const videoId = initJson.video_id;
    if (!videoId) throw new Error('meta init: missing video_id');

    // Step 2: tell Meta to fetch the file from video_url.
    const uploadUrl = new URL(`https://rupload.facebook.com/video-upload/v21.0/${videoId}`);
    const uploadRes = await fetch(uploadUrl.toString(), {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${req.access_token}`,
        file_url: req.video_url,
      },
    });
    if (!uploadRes.ok) {
      throw new Error(`meta upload failed: ${uploadRes.status}`);
    }

    // Step 3: finalize.
    const finalizeUrl = new URL(`${META_GRAPH}/${req.account_id}/video_reels`);
    finalizeUrl.searchParams.set('upload_phase', 'finish');
    finalizeUrl.searchParams.set('video_id', videoId);
    finalizeUrl.searchParams.set('video_state', 'PUBLISHED');
    finalizeUrl.searchParams.set('description', req.caption);
    finalizeUrl.searchParams.set('access_token', req.access_token);
    const finalRes = await fetch(finalizeUrl.toString(), { method: 'POST' });
    const finalJson = (await finalRes.json()) as {
      success?: boolean;
      error?: { message?: string };
    };
    if (!finalRes.ok || finalJson.error) {
      throw new Error(`meta finalize failed: ${finalRes.status} ${finalJson.error?.message ?? '?'}`);
    }
    return {
      publish_id: videoId,
      platform: this.platform,
      status: 'queued',
      raw: finalJson as Record<string, unknown>,
    };
  }
}
