'use server';

import { revalidatePath } from 'next/cache';
import { createApiToken, revokeApiToken } from '@/lib/kernel';

export interface CreateTokenState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  rawToken?: string;
  name?: string;
}

export async function createTokenAction(
  _prev: CreateTokenState,
  formData: FormData,
): Promise<CreateTokenState> {
  const name = String(formData.get('name') ?? '').trim();
  const tenant_id_raw = String(formData.get('tenant_id') ?? '').trim();
  const scopesRaw = String(formData.get('scopes') ?? '').trim();
  if (!name) return { status: 'error', message: 'name is required' };

  const scopes = scopesRaw
    ? scopesRaw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const tenant_id = tenant_id_raw === '' || tenant_id_raw === 'null' ? null : tenant_id_raw;
  try {
    const result = await createApiToken({ tenant_id, name, scopes });
    revalidatePath('/tokens');
    return {
      status: 'success',
      message: `Token "${result.name}" created. Copy it now — it cannot be shown again.`,
      rawToken: result.raw_token,
      name: result.name,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function revokeTokenAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;
  await revokeApiToken(id);
  revalidatePath('/tokens');
}
