import { NextResponse, type NextRequest } from 'next/server';

const isAuthPath = (path: string) => path.startsWith('/auth/');
const isAppPath = (path: string) => path.startsWith('/app/');

function hasSupabaseSessionCookie(req: NextRequest) {
  return req.cookies
    .getAll()
    .some((cookie) => cookie.name.includes('sb-') && cookie.name.includes('auth-token'));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!isAuthPath(pathname) && !isAppPath(pathname)) {
    return NextResponse.next();
  }

  const isLoggedIn = hasSupabaseSessionCookie(req);

  if (isAppPath(pathname) && !isLoggedIn) {
    return NextResponse.redirect(new URL('/auth/login', req.url));
  }

  if (isAuthPath(pathname) && isLoggedIn) {
    return NextResponse.redirect(new URL('/app/chat', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/app/:path*', '/auth/:path*'],
};
