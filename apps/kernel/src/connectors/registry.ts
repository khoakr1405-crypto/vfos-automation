import type { Logger } from 'pino';
import type { PlatformConnector, PlatformName } from './types.js';

export class ConnectorRegistry {
  private readonly byPlatform = new Map<PlatformName, PlatformConnector>();

  constructor(private readonly logger: Logger) {}

  register(c: PlatformConnector): void {
    if (this.byPlatform.has(c.platform)) {
      throw new Error(`connector already registered: ${c.platform}`);
    }
    this.byPlatform.set(c.platform, c);
    this.logger.info({ platform: c.platform, mode: c.mode }, 'connector.registered');
  }

  get(platform: PlatformName): PlatformConnector {
    const c = this.byPlatform.get(platform);
    if (!c) throw new Error(`connector not registered: ${platform}`);
    return c;
  }

  has(platform: PlatformName): boolean {
    return this.byPlatform.has(platform);
  }

  list(): readonly PlatformConnector[] {
    return [...this.byPlatform.values()];
  }
}
