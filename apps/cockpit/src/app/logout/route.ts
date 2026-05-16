import { NextResponse } from 'next/server';
import { clearSessionCookie, readSessionCookie } from '@/lib/session';

const KERNEL_URL = process.env.KERNEL_URL ?? 'http://localhost:3000';

export async function POST(req: Request): Promise<Response> {
  const token = await readSessionCookie();
  if (token) {
    await fetch(`${KERNEL_URL}/v1/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }
  await clearSessionCookie();
  const url = new URL('/login', req.url);
  return NextResponse.redirect(url, 303);
}

export async function GET(req: Request): Promise<Response> {
  return POST(req);
}
