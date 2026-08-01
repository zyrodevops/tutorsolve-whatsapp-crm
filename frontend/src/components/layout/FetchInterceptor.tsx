'use client';

import { useEffect } from 'react';
import { API_URL } from '@/lib/config';

// Module-level (not component state) so every concurrent 401 across the app
// awaits the same in-flight refresh instead of each firing its own -- without
// this, N requests failing at once would trigger N refresh calls.
let refreshPromise: Promise<boolean> | null = null;

function refreshAccessToken(originalFetch: typeof fetch): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = originalFetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include'
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export default function FetchInterceptor() {
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      let response = await originalFetch(...args);

      const url = typeof args[0] === 'string' ? args[0] : (args[0] instanceof Request ? args[0].url : '');

      if (response.status === 401 && url && !url.includes('/api/auth/refresh') && !url.includes('/api/auth/login')) {
        try {
          const refreshed = await refreshAccessToken(originalFetch);

          if (refreshed) {
            // Retry the original request
            response = await originalFetch(...args);
          }
        } catch (err) {
          console.error("Token refresh failed", err);
        }
      }
      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
