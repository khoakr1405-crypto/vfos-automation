import type { OAuthAuthorizeContext, OAuthExchangeResult, OAuthProvider } from './types.js';

// TikTok OAuth v2 (Login Kit + Content Posting).
// Docs: https://developers.tiktok.com/doc/login-kit-web
const TIKTOK_AUTHORIZE = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_USERINFO = 'https://open.tiktokapis.com/v2/user/info/';

const TIKTOK_SCOPES = ['user.info.basic', 'video.upload', 'video.publish'];

export class TikTokOAuthProvider implements OAuthProvider {
  readonly platform = 'tiktok' as const;
  readonly mode = 'live' as const;

  constructor(
    private readonly clientKey: string,
    private readonly clientSecret: string,
  ) {}

  authorizeUrl(ctx: OAuthAuthorizeContext): string {
    const url = new URL(TIKTOK_AUTHORIZE);
    url.searchParams.set('client_key', this.clientKey);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', TIKTOK_SCOPES.join(','));
    url.searchParams.set('redirect_uri', ctx.redirect_uri);
    url.searchParams.set('state', ctx.state);
    return url.toString();
  }

  async exchangeCode(code: string, redirect_uri: string): Promise<OAuthExchangeResult> {
    const body = new URLSearchParams({
      client_key: this.clientKey,
      client_secret: this.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri,
    });
    const tokRes = await fetch(TIKTOK_TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const tok = (await tokRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      open_id?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };
    if (!tokRes.ok || tok.error || !tok.access_token || !tok.open_id) {
      throw new Error(
        `tiktok token exchange failed: ${tokRes.status} ${tok.error_description ?? tok.error ?? '?'}`,
      );
    }
    // Best-effort handle lookup; non-fatal if it fails.
    let handle: string | undefined;
    try {
      const infoRes = await fetch(`${TIKTOK_USERINFO}?fields=display_name,union_id`, {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      });
      const info = (await infoRes.json()) as {
        data?: { user?: { display_name?: string } };
      };
      handle = info.data?.user?.display_name;
    } catch {
      // ignore
    }

    const result: OAuthExchangeResult = {
      account_id: tok.open_id,
      access_token: tok.access_token,
      scopes: tok.scope ? tok.scope.split(',') : TIKTOK_SCOPES,
    };
    if (handle) result.handle = handle;
    if (tok.refresh_token) result.refresh_token = tok.refresh_token;
    if (tok.expires_in) result.expires_at = new Date(Date.now() + tok.expires_in * 1000);
    return result;
  }
}
