import React from 'react';
import { render } from '@testing-library/react';
import FetchInterceptor from '../src/components/layout/FetchInterceptor';

describe('FetchInterceptor', () => {
  let originalWindowFetch: typeof fetch;

  beforeEach(() => {
    originalWindowFetch = window.fetch;
  });

  afterEach(() => {
    window.fetch = originalWindowFetch;
  });

  it('shares a single /api/auth/refresh call across concurrent 401s instead of one per request', async () => {
    let refreshCallCount = 0;

    const mockFetch = jest.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/auth/refresh')) {
        refreshCallCount++;
        return Promise.resolve({ ok: true, status: 200 });
      }
      // Every other endpoint 401s, simulating an expired access token.
      return Promise.resolve({ ok: false, status: 401 });
    });

    window.fetch = mockFetch as unknown as typeof fetch;

    render(<FetchInterceptor />);

    await Promise.all([
      window.fetch('/api/thing-a', { credentials: 'include' }),
      window.fetch('/api/thing-b', { credentials: 'include' }),
    ]);

    expect(refreshCallCount).toBe(1);
  });
});
