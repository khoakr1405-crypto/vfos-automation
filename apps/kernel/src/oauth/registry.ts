import type { Logger } from 'pino';
import type { PlatformName } from '../connectors/types.js';
import type { OAuthProvider } from './types.js';

export class OAuthRegistry {
  private readonly byPlatform = new Map<PlatformName, OAuthProvider>();

  constructor(private readonly logger: Logger) {}

  register(p: OAuthProvider): void {
    this.byPlatform.set(p.platform, p);
    this.logger.info({ platform: p.platform, mode: p.mode }, 'oauth.registered');
  }

  get(platform: PlatformName): OAuthProvider {
    const p = this.byPlatform.get(platform);
    if (!p) throw new Error(`oauth provider not registered: ${platform}`);
    return p;
  }

  has(platform: PlatformName): boolean {
    return this.byPlatform.has(platform);
  }

  list(): readonly OAuthProvider[] {
    return [...this.byPlatform.values()];
  }
}
