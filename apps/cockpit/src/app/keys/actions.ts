'use server';

import { revalidatePath } from 'next/cache';
import { revokeTenantKey, setTenantKey } from '@/lib/kernel';

export interface SetKeyState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  provider?: string;
  last4?: string;
}

export async function setKeyAction(
  _prev: SetKeyState,
  formData: FormData,
): Promise<SetKeyState> {
  const provider = String(formData.get('provider') ?? '').trim();
  const api_key = String(formData.get('api_key') ?? '').trim();
  const label = String(formData.get('label') ?? '').trim();
  if (!provider) return { status: 'error', message: 'provider is required' };
  if (api_key.length < 8) {
    return { status: 'error', message: 'api_key must be at least 8 characters' };
  }
  try {
    const res = await setTenantKey({
      provider,
      api_key,
      ...(label ? { label } : {}),
    });
    revalidatePath('/keys');
    return {
      status: 'success',
      message: `Key stored — last4 ${res.key.last4}`,
      provider: res.key.provider,
      last4: res.key.last4,
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function revokeKeyAction(formData: FormData): Promise<void> {
  const provider = String(formData.get('provider') ?? '').trim();
  if (!provider) return;
  await revokeTenantKey(provider);
  revalidatePath('/keys');
}
