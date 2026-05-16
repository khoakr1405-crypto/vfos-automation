'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { linkConnector, startOAuth, unlinkConnector } from '@/lib/kernel';

export interface LinkConnectorState {
  status: 'idle' | 'success' | 'error';
  message?: string;
}

export async function linkConnectorAction(
  _prev: LinkConnectorState,
  formData: FormData,
): Promise<LinkConnectorState> {
  const platform = String(formData.get('platform') ?? '').trim();
  const account_id = String(formData.get('account_id') ?? '').trim();
  const handle = String(formData.get('handle') ?? '').trim();
  const access_token = String(formData.get('access_token') ?? '').trim();
  const refresh_token = String(formData.get('refresh_token') ?? '').trim();
  const expires_at = String(formData.get('expires_at') ?? '').trim();
  const scopesRaw = String(formData.get('scopes') ?? '').trim();
  if (!platform) return { status: 'error', message: 'platform is required' };
  if (!account_id) return { status: 'error', message: 'account_id is required' };
  if (access_token.length < 8) {
    return { status: 'error', message: 'access_token must be at least 8 chars' };
  }
  const scopes = scopesRaw
    ? scopesRaw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
    : [];

  try {
    const payload: Parameters<typeof linkConnector>[0] = {
      platform,
      account_id,
      access_token,
      scopes,
    };
    if (handle) payload.handle = handle;
    if (refresh_token) payload.refresh_token = refresh_token;
    if (expires_at) payload.expires_at = new Date(expires_at).toISOString();
    const res = await linkConnector(payload);
    revalidatePath('/connectors');
    return {
      status: 'success',
      message: `Credential ${res.action}: ${res.credential.platform}/${res.credential.account_id}`,
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function unlinkConnectorAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;
  await unlinkConnector(id);
  revalidatePath('/connectors');
}

export async function startOAuthAction(formData: FormData): Promise<void> {
  const platform = String(formData.get('platform') ?? '').trim();
  if (!platform) return;
  const { authorize_url } = await startOAuth(platform);
  redirect(authorize_url);
}
