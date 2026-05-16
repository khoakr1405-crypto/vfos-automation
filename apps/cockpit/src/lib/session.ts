import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'vfos_session';

export interface SessionInfo {
  token: string;
  email?: string;
  is_admin?: boolean;
  tenant_id?: string | null;
}

const SESSION_TTL_S = 60 * 60 * 24 * 30;

export async function readSessionCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_S,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
