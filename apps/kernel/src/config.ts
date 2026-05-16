import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  KERNEL_PORT: z.coerce.number().int().positive().default(3000),
  KERNEL_HOST: z.string().default('0.0.0.0'),
  PLUGINS_DIR: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  TENANT_DEFAULT_ID: z.string().default('00000000-0000-0000-0000-000000000001'),
  ANTHROPIC_API_KEY: z.string().optional(),
  BUDGET_DAILY_USD: z.coerce.number().positive().default(5),
  REDIS_URL: z.string().url().optional(),
  DATA_DIR: z.string().optional(),
  VFOS_CREDENTIAL_KEY: z.string().optional(),
  TIKTOK_MODE: z.enum(['mock', 'live']).default('mock'),
  META_MODE: z.enum(['mock', 'live']).default('mock'),
  TIKTOK_CLIENT_KEY: z.string().optional(),
  TIKTOK_CLIENT_SECRET: z.string().optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  COCKPIT_ORIGIN: z.string().url().default('http://localhost:3001'),
  KERNEL_PUBLIC_ORIGIN: z.string().url().default('http://localhost:3000'),
});

export type KernelConfig = Omit<z.infer<typeof ConfigSchema>, 'PLUGINS_DIR' | 'DATA_DIR'> & {
  PLUGINS_DIR: string;
  DATA_DIR: string;
};

function loadEnvFile(root: string): void {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

function findWorkspaceRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

export function loadConfig(): KernelConfig {
  const root = findWorkspaceRoot(process.cwd());
  loadEnvFile(root);
  const parsed = ConfigSchema.parse(process.env);
  const pluginsDir = parsed.PLUGINS_DIR
    ? resolve(parsed.PLUGINS_DIR)
    : join(root, 'plugins');
  const dataDir = parsed.DATA_DIR ? resolve(parsed.DATA_DIR) : join(root, 'data');
  return { ...parsed, PLUGINS_DIR: pluginsDir, DATA_DIR: dataDir };
}
