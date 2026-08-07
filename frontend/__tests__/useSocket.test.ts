import { renderHook, act } from '@testing-library/react';
import { useSocket } from '@/hooks/useSocket';
import { io } from 'socket.io-client';

// Mock socket.io-client
jest.mock('socket.io-client', () => {
  const mSocket = {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
  return {
    io: jest.fn(() => mSocket),
  };
});

describe('useSocket Hook Edge Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes socket and registers event listeners', () => {
    const { result } = renderHook(() => useSocket());

    expect(io).toHaveBeenCalledTimes(1);
    const mockSocket = (io as jest.Mock).mock.results[0].value;

    // It should register connect, disconnect, connect_error
    expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));

    expect(result.current.isConnected).toBe(false);
  });

  it('disconnects on unmount', () => {
    const { unmount } = renderHook(() => useSocket());

    const mockSocket = (io as jest.Mock).mock.results[0].value;
    unmount();

    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
  });

  it('flips isConnected state on connect/disconnect events', () => {
    const { result } = renderHook(() => useSocket());
    const mockSocket = (io as jest.Mock).mock.results[0].value;

    // Extract the callbacks
    const connectCallback = mockSocket.on.mock.calls.find((c: unknown[]) => c[0] === 'connect')[1];
    const disconnectCallback = mockSocket.on.mock.calls.find((c: unknown[]) => c[0] === 'disconnect')[1];

    act(() => {
      connectCallback();
    });
    expect(result.current.isConnected).toBe(true);

    act(() => {
      disconnectCallback();
    });
    expect(result.current.isConnected).toBe(false);
  });

  it('on/off/emit proxy through to the underlying socket instance', () => {
    const { result } = renderHook(() => useSocket());
    const mockSocket = (io as jest.Mock).mock.results[0].value;

    const handler = jest.fn();
    act(() => {
      result.current.on('new_message', handler);
    });
    expect(mockSocket.on).toHaveBeenCalledWith('new_message', handler);

    act(() => {
      result.current.emit('agent_typing', { conversationId: 'conv_1' });
    });
    expect(mockSocket.emit).toHaveBeenCalledWith('agent_typing', { conversationId: 'conv_1' });

    act(() => {
      result.current.off('new_message', handler);
    });
    expect(mockSocket.off).toHaveBeenCalledWith('new_message', handler);
  });

  it('attempts a silent token refresh when the socket fails to connect', () => {
    // If the socket ever drops after the 15-minute access_token cookie has
    // expired, reconnecting with the same stale cookie fails forever unless
    // something refreshes it -- unlike plain HTTP calls, sockets have no
    // built-in 401-retry path (see FetchInterceptor), so this hook has to
    // trigger that refresh itself.
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as jest.Mock;

    renderHook(() => useSocket());
    const mockSocket = (io as jest.Mock).mock.results[0].value;
    const connectErrorCallback = mockSocket.on.mock.calls.find((c: unknown[]) => c[0] === 'connect_error')[1];

    act(() => {
      connectErrorCallback(new Error('websocket error: token expired'));
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/refresh'),
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );
  });

  it('does not fire overlapping refresh calls for back-to-back connect_error events', () => {
    let resolveRefresh!: (value: unknown) => void;
    global.fetch = jest.fn(() => new Promise((resolve) => { resolveRefresh = resolve; })) as jest.Mock;

    renderHook(() => useSocket());
    const mockSocket = (io as jest.Mock).mock.results[0].value;
    const connectErrorCallback = mockSocket.on.mock.calls.find((c: unknown[]) => c[0] === 'connect_error')[1];

    act(() => {
      connectErrorCallback(new Error('websocket error'));
      connectErrorCallback(new Error('websocket error'));
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    resolveRefresh({ ok: true });
  });

  it('on/off/emit are no-ops before the socket has connected on mount', () => {
    // Simulate calling the wrappers before the effect has run by checking
    // they never throw even if socketRef.current were still null.
    const { result } = renderHook(() => useSocket());
    expect(() => result.current.on('x', jest.fn())).not.toThrow();
    expect(() => result.current.off('x', jest.fn())).not.toThrow();
    expect(() => result.current.emit('x')).not.toThrow();
  });
});
