'use server';

import { revalidatePath } from 'next/cache';
import { createInvite, revokeInvite } from '@/lib/kernel';

export interface CreateInviteState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  invite?: {
    token: string;
    email: string | null;
    expires_at: string;
    scopes: readonly string[];
    is_admin: boolean;
  };
  cockpitOrigin?: string;
}

export async function createInviteAction(
  _prev: CreateInviteState,
  formData: FormData,
): Promise<CreateInviteState> {
  const emailRaw = String(formData.get('email') ?? '').trim();
  const scopesRaw = String(formData.get('scopes') ?? '').trim();
  const isAdmin = formData.get('is_admin') === 'on';
  const ttlHours = Number(formData.get('ttl_hours') ?? 168);
  const tenantId = String(formData.get('tenant_id') ?? '').trim();

  const scopes = scopesRaw
    ? scopesRaw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
    : [];

  try {
    const payload: Parameters<typeof createInvite>[0] = {
      scopes,
      is_admin: isAdmin,
      ttl_hours: Number.isFinite(ttlHours) ? ttlHours : 168,
    };
    if (emailRaw) payload.email = emailRaw;
    if (tenantId) payload.tenant_id = tenantId;
    const res = await createInvite(payload);
    revalidatePath('/invites');
    return {
      status: 'success',
      invite: {
        token: res.invite.token,
        email: res.invite.email,
        expires_at: res.invite.expires_at,
        scopes: res.invite.scopes,
        is_admin: res.invite.is_admin,
      },
      cockpitOrigin: process.env.COCKPIT_ORIGIN ?? '',
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '').trim();
  if (!token) return;
  await revokeInvite(token);
  revalidatePath('/invites');
}
