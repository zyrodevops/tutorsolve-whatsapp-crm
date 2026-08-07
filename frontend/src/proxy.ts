import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  // Check if the user is trying to access a protected route
  if (request.nextUrl.pathname.startsWith('/admin') || request.nextUrl.pathname.startsWith('/dashboard')) {
    // access_token is short-lived (15 minutes) regardless of "Remember me" --
    // only refresh_token respects that (7 days vs 1 day). Once access_token
    // expires, the client-side FetchInterceptor silently mints a fresh one
    // via refresh_token on the app's first API call. If this check only
    // looked for access_token, every navigation after 15 minutes would bounce
    // straight to /login before the app -- and that silent refresh -- ever
    // got a chance to run, defeating "Remember me" entirely. Real
    // authorization is still enforced server-side on every API call via
    // require_role(), so relaxing this to "either cookie present" doesn't
    // weaken security -- it's only a UI gate against flashing protected
    // content before an auth check.
    const hasAccessToken = request.cookies.has('access_token');
    const hasRefreshToken = request.cookies.has('refresh_token');

    if (!hasAccessToken && !hasRefreshToken) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // Allow the request to proceed
  return NextResponse.next();
}

// Configure which paths the middleware runs on
export const config = {
  matcher: ['/admin/:path*', '/dashboard/:path*'],
};
