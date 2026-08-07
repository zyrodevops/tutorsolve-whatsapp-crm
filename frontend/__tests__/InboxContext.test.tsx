import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { io } from 'socket.io-client';
import { InboxProvider, useInbox } from '../src/context/InboxContext';

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

describe('InboxProvider - resync after socket reconnect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: [] }),
    }) as jest.Mock;
  });

  it('refetches conversations when the socket reconnects after a disconnect, but not on the initial connect', async () => {
    const { result } = renderHook(() => useInbox(), {
      wrapper: ({ children }) => <InboxProvider>{children}</InboxProvider>,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const mockSocket = (io as jest.Mock).mock.results[0].value;
    const connectCallback = mockSocket.on.mock.calls.find((c: unknown[]) => c[0] === 'connect')[1];
    const disconnectCallback = mockSocket.on.mock.calls.find((c: unknown[]) => c[0] === 'disconnect')[1];

    // The very first connect is not a "reconnect" -- the mount effect already fetched.
    act(() => {
      connectCallback();
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // A real reconnect (disconnect, then connect again) must resync state,
    // since events emitted during the disconnect window would otherwise be
    // permanently missed.
    act(() => {
      disconnectCallback();
    });
    act(() => {
      connectCallback();
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});

describe('InboxProvider - message status updates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: [] }),
    }) as jest.Mock;
  });

  it('exposes the latest message_status_updated payload from the socket', async () => {
    const { result } = renderHook(() => useInbox(), {
      wrapper: ({ children }) => <InboxProvider>{children}</InboxProvider>,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.messageStatusUpdate).toBeNull();

    const mockSocket = (io as jest.Mock).mock.results[0].value;
    const statusCallback = mockSocket.on.mock.calls.find(
      (c: unknown[]) => c[0] === 'message_status_updated'
    )[1];

    const payload = { conversation_id: 'conv_1', message_id: 'msg_1', delivery_status: 'READ' };
    act(() => {
      statusCallback(payload);
    });

    expect(result.current.messageStatusUpdate).toEqual(payload);
  });
});
