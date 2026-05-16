'use server';

import { redirect } from 'next/navigation';
import { setSessionCookie } from '@/lib/session';

const KERNEL_URL = process.env.KERNEL_URL ?? 'http://localhost:3000';

export interface AcceptInviteState {
  status: 'idle' | 'error';
  message?: string;
}

export async function acceptInviteAction(
  _prev: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const token = String(formData.get('token') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!token) return { status: 'error', message: 'invite token missing' };
  if (!email || !password) {
    return { status: 'error', message: 'email and password are required' };
  }
  if (password.length < 8) {
    return { status: 'error', message: 'password must be at least 8 characters' };
  }
  const res = await fetch(
    `${KERNEL_URL}/v1/auth/invite/${encodeURIComponent(token)}/accept`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    token?: string;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.token) {
    return { status: 'error', message: data.error ?? `accept failed (${res.status})` };
  }
  await setSessionCookie(data.token);
  redirect('/');
}
