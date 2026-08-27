import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '@/lib/config';

type SocketEventHandler = (...args: unknown[]) => void;

// Module-level (not per-hook-instance) so concurrent connect_error events
// share one in-flight refresh instead of each firing its own -- mirrors
// FetchInterceptor's dedup for the same reason.
let socketRefreshPromise: Promise<void> | null = null;

function refreshAccessTokenForSocket(): Promise<void> {
  if (!socketRefreshPromise) {
    socketRefreshPromise = fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include'
    })
      .then(() => undefined, () => undefined)
      .finally(() => {
        socketRefreshPromise = null;
      });
  }
  return socketRefreshPromise;
}

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Use empty string if API_URL is relative (e.g. proxy) or the actual API_URL
    const socketUrl = API_URL.startsWith('http') ? API_URL : window.location.origin;

    const socket = io(socketUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling'], // Fallback if necessary
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
      // A stale/expired access_token cookie is a common cause of a
      // reconnect failing -- unlike plain fetch() calls (see
      // FetchInterceptor), Socket.IO has no built-in way to retry after a
      // 401-equivalent, so proactively refresh here. Socket.IO's own
      // exponential-backoff reconnect will then pick up the fresh cookie on
      // its next attempt.
      refreshAccessTokenForSocket();
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Ref reads must happen in event handlers/effects, never during render, so
  // the raw socket instance is never returned directly -- these stable
  // wrappers defer the ref read until a consumer's own effect actually calls them.
  const on = useCallback((event: string, handler: SocketEventHandler) => {
    socketRef.current?.on(event, handler);
  }, []);

  const off = useCallback((event: string, handler: SocketEventHandler) => {
    socketRef.current?.off(event, handler);
  }, []);

  const emit = useCallback((event: string, ...args: unknown[]) => {
    socketRef.current?.emit(event, ...args);
  }, []);

  return { on, off, emit, isConnected };
}
