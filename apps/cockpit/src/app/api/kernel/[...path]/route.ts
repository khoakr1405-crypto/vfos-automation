import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { readServerToken } from '@/lib/server-token';

const KERNEL_URL = process.env.KERNEL_URL ?? 'http://localhost:3000';
const SESSION_COOKIE = 'vfos_session';
const PUBLIC_PATHS = new Set([
  '/v1/auth/signup',
  '/v1/auth/login',
  '/v1/auth/bootstrap-status',
]);
const HOP_BY_HOP = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
]);

interface Ctx {
  params: Promise<{ path: string[] }>;
}

export async function GET(req: Request, ctx: Ctx) {
  return forward(req, ctx);
}
export async function POST(req: Request, ctx: Ctx) {
  return forward(req, ctx);
}
export async function PUT(req: Request, ctx: Ctx) {
  return forward(req, ctx);
}
export async function PATCH(req: Request, ctx: Ctx) {
  return forward(req, ctx);
}
export async function DELETE(req: Request, ctx: Ctx) {
  return forward(req, ctx);
}

async function forward(req: Request, { params }: Ctx): Promise<Response> {
  const { path } = await params;
  const url = new URL(req.url);
  const kernelPath = `/${path.join('/')}`;
  const target = `${KERNEL_URL}${kernelPath}${url.search}`;
  const isPublic = PUBLIC_PATHS.has(kernelPath);

  // Auth resolution: session cookie wins over env admin token (so a logged-in
  // user's request hits the kernel with their own credential). For public
  // auth endpoints, attach no token — let the request through unauth'd so
  // /v1/auth/signup and /v1/auth/login can do their thing.
  let token: string | null = null;
  if (!isPublic) {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE);
    token = sessionCookie?.value ?? (await readServerToken());
  }

  const outHeaders = new Headers();
  req.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    if (key.toLowerCase() === 'cookie') return;
    outHeaders.set(key, value);
  });
  if (token) outHeaders.set('authorization', `Bearer ${token}`);

  const init: RequestInit = {
    method: req.method,
    headers: outHeaders,
    redirect: 'manual',
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `kernel proxy failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  const respHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    respHeaders.set(key, value);
  });
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}
