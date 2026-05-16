import type { PlatformName } from '../connectors/types.js';

export interface OAuthAuthorizeContext {
  state: string;
  redirect_uri: string;
}

export interface OAuthExchangeResult {
  account_id: string;
  handle?: string;
  access_token: string;
  refresh_token?: string;
  expires_at?: Date;
  scopes: string[];
  meta?: Record<string, unknown>;
}

export interface OAuthProvider {
  readonly platform: PlatformName;
  readonly mode: 'mock' | 'live';
  authorizeUrl(ctx: OAuthAuthorizeContext): string;
  exchangeCode(code: string, redirect_uri: string): Promise<OAuthExchangeResult>;
}
