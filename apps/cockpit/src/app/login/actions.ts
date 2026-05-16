'use server';

import { redirect } from 'next/navigation';
import { setSessionCookie } from '@/lib/session';

const KERNEL_URL = process.env.KERNEL_URL ?? 'http://localhost:3000';

export interface AuthFormState {
  status: 'idle' | 'error';
  message?: string;
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) {
    return { status: 'error', message: 'email and password are required' };
  }
  const res = await fetch(`${KERNEL_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    token?: string;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.token) {
    return { status: 'error', message: data.error ?? `login failed (${res.status})` };
  }
  await setSessionCookie(data.token);
  redirect('/');
}

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) {
    return { status: 'error', message: 'email and password are required' };
  }
  if (password.length < 8) {
    return { status: 'error', message: 'password must be at least 8 characters' };
  }
  const res = await fetch(`${KERNEL_URL}/v1/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    token?: string;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.token) {
    return { status: 'error', message: data.error ?? `signup failed (${res.status})` };
  }
  await setSessionCookie(data.token);
  redirect('/');
}
