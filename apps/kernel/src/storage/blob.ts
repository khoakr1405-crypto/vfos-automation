import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Logger } from 'pino';

export class BlobStore {
  constructor(
    private readonly logger: Logger,
    private readonly root: string,
  ) {}

  async start(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    this.logger.info({ root: this.root }, 'blob.ready');
  }

  async put(tenant_id: string, hash: string, content: Buffer): Promise<void> {
    const path = this.pathFor(tenant_id, hash);
    if (existsSync(path)) return;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }

  async get(tenant_id: string, hash: string): Promise<Buffer> {
    const path = this.pathFor(tenant_id, hash);
    return readFile(path);
  }

  has(tenant_id: string, hash: string): boolean {
    return existsSync(this.pathFor(tenant_id, hash));
  }

  private pathFor(tenant_id: string, hash: string): string {
    return join(this.root, tenant_id, hash.slice(0, 2), hash);
  }
}
