/**
 * @jest-environment node
 */
// Next.js middleware runs in the Edge/Node runtime, not jsdom -- jsdom lacks
// the Fetch API primitives (Request/Response/Headers) that NextRequest
// extends, so this file needs the node test environment specifically.
import { NextRequest } from 'next/server';
import { proxy } from '../src/proxy';

function requestFor(path: string, cookieHeader?: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost:3000'), {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
}

describe('proxy (auth middleware)', () => {
  it('redirects to /login when there is no access_token and no refresh_token', () => {
    const res = proxy(requestFor('/dashboard'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('allows the request through when access_token is present', () => {
    const res = proxy(requestFor('/dashboard', 'access_token=valid-jwt'));
    expect(res.status).not.toBe(307);
  });

  it('allows the request through when only refresh_token is present (access_token expired but session still valid)', () => {
    // This is the "Remember me" case: the 15-minute access_token cookie has
    // expired, but the longer-lived refresh_token hasn't. The client-side
    // FetchInterceptor silently mints a fresh access_token on the first API
    // call -- the middleware must not short-circuit that by redirecting to
    // /login before the app even loads.
    const res = proxy(requestFor('/dashboard', 'refresh_token=valid-refresh-jwt'));
    expect(res.status).not.toBe(307);
  });

  it('redirects to /login for /admin routes with no cookies at all', () => {
    const res = proxy(requestFor('/admin/team'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('does not touch unrelated routes', () => {
    const res = proxy(requestFor('/login'));
    expect(res.status).not.toBe(307);
  });
});
