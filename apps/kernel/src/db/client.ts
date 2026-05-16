import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import type { Logger } from 'pino';
import * as schema from '@vfos/db/schema';

const HERE = dirname(fileURLToPath(import.meta.url));
const BOOTSTRAP_SQL_PATH = join(HERE, 'bootstrap.sql');

export type DbHandle = PgliteDatabase<typeof schema>;

export interface DbContext {
  db: DbHandle;
  shutdown(): Promise<void>;
}

export interface CreateDbOpts {
  dataDir: string;
}

export async function createDb(logger: Logger, opts: CreateDbOpts): Promise<DbContext> {
  await mkdir(opts.dataDir, { recursive: true });
  const dbDir = join(opts.dataDir, 'pglite');
  const client = new PGlite(dbDir);
  await client.waitReady;

  const bootstrap = await readFile(BOOTSTRAP_SQL_PATH, 'utf8');
  await client.exec(bootstrap);

  const db = drizzle(client, { schema });
  logger.info({ path: dbDir }, 'db.ready');

  return {
    db,
    async shutdown() {
      await client.close();
      logger.info('db.closed');
    },
  };
}
