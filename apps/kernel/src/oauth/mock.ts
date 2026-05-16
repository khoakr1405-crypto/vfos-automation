import { ulid } from 'ulid';
import type { PlatformName } from '../connectors/types.js';
import type { OAuthAuthorizeContext, OAuthExchangeResult, OAuthProvider } from './types.js';

// Mock provider short-circuits the OAuth dance: authorizeUrl returns the
// kernel callback directly with a mock code, so the browser bounces straight
// back without ever leaving localhost. Used for dev + smoke testing.
export class MockOAuthProvider implements OAuthProvider {
  readonly mode = 'mock' as const;
  constructor(readonly platform: PlatformName) {}

  authorizeUrl(ctx: OAuthAuthorizeContext): string {
    const url = new URL(ctx.redirect_uri);
    url.searchParams.set('code', `mock_${this.platform}_${ulid()}`);
    url.searchParams.set('state', ctx.state);
    return url.toString();
  }

  async exchangeCode(code: string): Promise<OAuthExchangeResult> {
    // Derive a stable-ish account id from the code so the same mock flow
    // links to the same fake account if re-run quickly.
    const seed = code.split('_').pop() ?? ulid();
    return {
      account_id: `mock_${this.platform}_${seed.slice(0, 10)}`,
      handle: `@mock_${this.platform}`,
      access_token: `mock_access_${this.platform}_${seed}`,
      refresh_token: `mock_refresh_${this.platform}_${seed}`,
      expires_at: new Date(Date.now() + 3600_000),
      scopes: defaultScopes(this.platform),
      meta: { provider: 'mock' },
    };
  }
}

function defaultScopes(platform: PlatformName): string[] {
  switch (platform) {
    case 'tiktok':
      return ['user.info.basic', 'video.upload', 'video.publish'];
    case 'facebook':
      return ['pages_manage_posts', 'pages_read_engagement'];
    default:
      return [];
  }
}
