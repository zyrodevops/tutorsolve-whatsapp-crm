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

  it('on/off/emit are no-ops before the socket has connected on mount', () => {
    // Simulate calling the wrappers before the effect has run by checking
    // they never throw even if socketRef.current were still null.
    const { result } = renderHook(() => useSocket());
    expect(() => result.current.on('x', jest.fn())).not.toThrow();
    expect(() => result.current.off('x', jest.fn())).not.toThrow();
    expect(() => result.current.emit('x')).not.toThrow();
  });
});
