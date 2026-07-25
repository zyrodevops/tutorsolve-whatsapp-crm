import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '@/lib/config';

type SocketEventHandler = (...args: unknown[]) => void;

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
      console.log('Socket connected');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Socket disconnected');
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
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
