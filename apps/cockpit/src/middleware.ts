import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'vfos_session';
const PUBLIC_ROUTES = new Set(['/login', '/signup']);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Bypass: public pages, Next.js internals, and the entire kernel proxy.
  // (The /api/kernel/* proxy enforces auth itself: it prefers the session
  // cookie when present, otherwise the env admin token. Routing public
  // endpoints like /v1/auth/login through middleware would break signup.)
  if (
    PUBLIC_ROUTES.has(pathname) ||
    pathname.startsWith('/invite/') ||
    pathname.startsWith('/api/kernel/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
