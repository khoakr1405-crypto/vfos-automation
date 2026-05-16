import type { Logger } from 'pino';
import type { LLMDriver } from '@vfos/sdk';

export class DriverRegistry {
  private readonly drivers = new Map<string, LLMDriver>();

  constructor(private readonly logger: Logger) {}

  register(driver: LLMDriver): void {
    if (this.drivers.has(driver.name)) {
      throw new Error(`driver already registered: ${driver.name}`);
    }
    this.drivers.set(driver.name, driver);
    this.logger.info({ driver: driver.name }, 'driver.registered');
  }

  get(name: string): LLMDriver {
    const d = this.drivers.get(name);
    if (!d) throw new Error(`driver not found: ${name}`);
    return d;
  }

  has(name: string): boolean {
    return this.drivers.has(name);
  }

  list(): readonly LLMDriver[] {
    return [...this.drivers.values()];
  }
}
