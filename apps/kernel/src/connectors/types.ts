export type PlatformName = 'tiktok' | 'facebook' | 'instagram' | 'youtube' | 'threads';

export type ConnectorMode = 'mock' | 'live';

export interface PublishRequest {
  account_id: string;
  access_token: string;
  caption: string;
  hashtags?: readonly string[];
  privacy?: 'public' | 'unlisted' | 'private';
  video_url?: string;
  asset_id?: string;
  asset_size_bytes?: number;
  asset_mime?: string;
  meta?: Record<string, unknown>;
}

export interface PublishResponse {
  publish_id: string;
  platform: PlatformName;
  status: 'queued' | 'published' | 'failed';
  url?: string;
  raw?: Record<string, unknown>;
  warnings?: readonly string[];
}

export interface PlatformConnector {
  readonly platform: PlatformName;
  readonly mode: ConnectorMode;
  publish(req: PublishRequest): Promise<PublishResponse>;
}
