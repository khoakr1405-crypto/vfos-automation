import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

let cached: string | null | undefined;

/**
 * Server-side resolution of the admin token used to authenticate to the
 * kernel. Priority: KERNEL_ADMIN_TOKEN env > <workspace>/data/admin-token.txt.
 * Never invoked from client components.
 */
export async function readServerToken(): Promise<string | null> {
  if (cached !== undefined) return cached;
  if (process.env.KERNEL_ADMIN_TOKEN) {
    cached = process.env.KERNEL_ADMIN_TOKEN;
    return cached;
  }
  for (const path of candidatePaths()) {
    try {
      const text = await readFile(path, 'utf8');
      const trimmed = text.trim();
      if (trimmed) {
        cached = trimmed;
        return cached;
      }
    } catch {
      // try next
    }
  }
  cached = null;
  return cached;
}

function candidatePaths(): string[] {
  // Cockpit runs from apps/cockpit; workspace root is two levels up.
  return [
    join(process.cwd(), '..', '..', 'data', 'admin-token.txt'),
    join(process.cwd(), 'data', 'admin-token.txt'),
  ];
}
