import type { OAuthAuthorizeContext, OAuthExchangeResult, OAuthProvider } from './types.js';

// Meta Login for Business + Page access.
// Docs: https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
const META_AUTHORIZE = 'https://www.facebook.com/v21.0/dialog/oauth';
const META_TOKEN = 'https://graph.facebook.com/v21.0/oauth/access_token';
const META_ME_ACCOUNTS = 'https://graph.facebook.com/v21.0/me/accounts';

const META_SCOPES = [
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'business_management',
];

export class MetaOAuthProvider implements OAuthProvider {
  readonly platform = 'facebook' as const;
  readonly mode = 'live' as const;

  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
  ) {}

  authorizeUrl(ctx: OAuthAuthorizeContext): string {
    const url = new URL(META_AUTHORIZE);
    url.searchParams.set('client_id', this.appId);
    url.searchParams.set('redirect_uri', ctx.redirect_uri);
    url.searchParams.set('state', ctx.state);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', META_SCOPES.join(','));
    return url.toString();
  }

  async exchangeCode(code: string, redirect_uri: string): Promise<OAuthExchangeResult> {
    // Step 1: short-lived user token from code
    const exchangeUrl = new URL(META_TOKEN);
    exchangeUrl.searchParams.set('client_id', this.appId);
    exchangeUrl.searchParams.set('client_secret', this.appSecret);
    exchangeUrl.searchParams.set('redirect_uri', redirect_uri);
    exchangeUrl.searchParams.set('code', code);
    const tokRes = await fetch(exchangeUrl.toString());
    const tok = (await tokRes.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: { message?: string };
    };
    if (!tokRes.ok || tok.error || !tok.access_token) {
      throw new Error(`meta token exchange failed: ${tok.error?.message ?? tokRes.status}`);
    }
    const userToken = tok.access_token;

    // Step 2: pull the first Page from /me/accounts → that page's access_token
    // is what we use for publishing. Meta's auth model attaches publish perms
    // to the page token, not the user token.
    const pagesRes = await fetch(`${META_ME_ACCOUNTS}?access_token=${encodeURIComponent(userToken)}`);
    const pages = (await pagesRes.json()) as {
      data?: { id: string; name?: string; access_token: string }[];
      error?: { message?: string };
    };
    if (!pagesRes.ok || pages.error) {
      throw new Error(`meta /me/accounts failed: ${pages.error?.message ?? pagesRes.status}`);
    }
    const page = pages.data?.[0];
    if (!page) {
      throw new Error('meta: no pages returned — user did not grant a manageable Page');
    }

    const result: OAuthExchangeResult = {
      account_id: page.id,
      access_token: page.access_token,
      scopes: META_SCOPES,
      meta: { granted_pages_count: pages.data?.length ?? 0 },
    };
    if (page.name) result.handle = page.name;
    // Page tokens minted from a long-lived user token are also long-lived
    // (~60d). We don't get an explicit expires_in here, so leave undefined.
    return result;
  }
}
