import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageThread from '../src/components/inbox/MessageThread';

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      status: 'success',
      data: [
        { id: '1', text_body: 'Hello', direction: 'INBOUND', sender_type: 'CUSTOMER', timestamp: '2023-01-01T10:00:00Z' },
        { id: '2', text_body: 'Hi there!', direction: 'OUTBOUND', sender_type: 'AGENT', timestamp: '2023-01-01T10:05:00Z' }
      ]
    }),
  })
) as jest.Mock;

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = jest.fn();

describe('MessageThread Component', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('defers to a controlled isNoteMode/onNoteModeChange pair when provided', async () => {
    const onNoteModeChange = jest.fn();
    render(
      <MessageThread conversationId="conv_1" isNoteMode={true} onNoteModeChange={onNoteModeChange} />
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type an internal note/i)).toBeInTheDocument();
    });

    // Toggling the note button must report back through the callback,
    // not just flip some internal state the parent can't see.
    fireEvent.click(screen.getByTitle('Toggle Internal Note'));
    expect(onNoteModeChange).toHaveBeenCalledWith(false);
  });

  it('renders placeholder when no conversation is selected', () => {
    render(<MessageThread conversationId={null} />);
    expect(screen.getByText('Select a conversation')).toBeInTheDocument();
  });

  it('fetches and renders messages when a conversation is selected', async () => {
    render(<MessageThread conversationId="conv_1" />);
    
    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
      expect(screen.getByText('Hi there!')).toBeInTheDocument();
    });
    
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/conversations/conv_1/messages'),
      expect.any(Object)
    );
  });
  
  it('rejects an oversized attachment client-side instead of queuing it to send', async () => {
    const { container } = render(<MessageThread conversationId="conv_1" />);

    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const oversizedFile = new File([new Uint8Array(17 * 1024 * 1024)], 'huge.pdf', { type: 'application/pdf' });

    fireEvent.change(fileInput, { target: { files: [oversizedFile] } });

    expect(await screen.findByText(/too large/i)).toBeInTheDocument();
    expect(screen.queryByText('huge.pdf')).not.toBeInTheDocument();
  });

  it('rejects an unsupported file type client-side', async () => {
    const { container } = render(<MessageThread conversationId="conv_1" />);

    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const badFile = new File(['#!/bin/sh'], 'script.sh', { type: 'application/x-sh' });

    fireEvent.change(fileInput, { target: { files: [badFile] } });

    expect(await screen.findByText(/unsupported file type/i)).toBeInTheDocument();
    expect(screen.queryByText('script.sh')).not.toBeInTheDocument();
  });

  it('accepts a valid attachment with no error', async () => {
    const { container } = render(<MessageThread conversationId="conv_1" />);

    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const goodFile = new File(['hello'], 'photo.png', { type: 'image/png' });

    fireEvent.change(fileInput, { target: { files: [goodFile] } });

    expect(await screen.findByText('photo.png')).toBeInTheDocument();
  });

  it('treats an unparseable whatsapp_window_expires_at as closed (fail closed, not open)', async () => {
    render(
      <MessageThread
        conversationId="conv_1"
        conversation={{
          id: 'conv_1',
          status: 'OPEN',
          unread_count: 0,
          last_message_preview: null,
          last_message_at: null,
          assigned_agent_id: null,
          masked_id: 'Lead-1',
          whatsapp_name: null,
          profile_photo_url: null,
          // Mirrors the backend's str(datetime) fallback for a non-Timestamp
          // value -- not a valid ISO string, so `new Date()` on this yields
          // Invalid Date. The compliance window must not silently stay open.
          whatsapp_window_expires_at: 'None',
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/window closed/i)).toBeInTheDocument();
    });
  });

  it('keeps the window open for a valid, non-expired timestamp', async () => {
    const futureIso = new Date(Date.now() + 90 * 60 * 1000).toISOString();
    render(
      <MessageThread
        conversationId="conv_1"
        conversation={{
          id: 'conv_1',
          status: 'OPEN',
          unread_count: 0,
          last_message_preview: null,
          last_message_at: null,
          assigned_agent_id: null,
          masked_id: 'Lead-1',
          whatsapp_name: null,
          profile_photo_url: null,
          whatsapp_window_expires_at: futureIso,
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });
    expect(screen.queryByText(/window closed/i)).not.toBeInTheDocument();
    // ~90 minutes left -- rendered with an hours component. Avoid asserting
    // the exact minute (rounds down between "now" here and the check inside
    // the component, so it could legitimately read 1h 29m).
    expect(screen.getByText(/1h \d+m left/i)).toBeInTheDocument();
  });

  it('shows minutes-only remaining time when under an hour is left', async () => {
    const soonIso = new Date(Date.now() + 25 * 60 * 1000).toISOString();
    render(
      <MessageThread
        conversationId="conv_1"
        conversation={{
          id: 'conv_1', status: 'OPEN', unread_count: 0, last_message_preview: null,
          last_message_at: null, assigned_agent_id: null, masked_id: 'Lead-1',
          whatsapp_name: null, profile_photo_url: null, whatsapp_window_expires_at: soonIso,
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/^(24|25)m left$/i)).toBeInTheDocument();
    });
  });

  it('does not show a countdown once the window has closed', async () => {
    render(
      <MessageThread
        conversationId="conv_1"
        conversation={{
          id: 'conv_1', status: 'OPEN', unread_count: 0, last_message_preview: null,
          last_message_at: null, assigned_agent_id: null, masked_id: 'Lead-1',
          whatsapp_name: null, profile_photo_url: null, whatsapp_window_expires_at: 'None',
        }}
      />
    );

    await waitFor(() => expect(screen.getByText(/window closed/i)).toBeInTheDocument());
    expect(screen.queryByText(/left$/i)).not.toBeInTheDocument();
  });

  it('does not show a countdown when there is no expiry timestamp at all', async () => {
    render(<MessageThread conversationId="conv_1" />);
    await waitFor(() => expect(screen.getByText('Hello')).toBeInTheDocument());
    expect(screen.queryByText(/left$/i)).not.toBeInTheDocument();
  });

  it('populates the closed-window template dropdown from real approved templates, not a hardcoded option', async () => {
    const defaultFetchImplTemplates = (global.fetch as jest.Mock).getMockImplementation();
    (global.fetch as jest.Mock).mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/api/admin/meta-templates')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'success',
            data: [
              { id: 't1', template_name: 'order_update', meta_template_id: '111', language_code: 'en_US', status: 'APPROVED', body: '' },
              { id: 't2', template_name: 'shipping_notice', meta_template_id: '222', language_code: 'en_US', status: 'APPROVED', body: '' },
            ],
          }),
        });
      }
      return defaultFetchImplTemplates!(url, opts);
    });

    render(
      <MessageThread
        conversationId="conv_1"
        conversation={{
          id: 'conv_1', status: 'OPEN', unread_count: 0, last_message_preview: null,
          last_message_at: null, assigned_agent_id: null, masked_id: 'Lead-1',
          whatsapp_name: null, profile_photo_url: null, whatsapp_window_expires_at: 'None',
        }}
      />
    );

    await waitFor(() => expect(screen.getByText(/window closed/i)).toBeInTheDocument());

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'order_update' })).toBeInTheDocument();
    });
    expect(screen.getByRole('option', { name: 'shipping_notice' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'hello_world' })).not.toBeInTheDocument();

    (global.fetch as jest.Mock).mockImplementation(defaultFetchImplTemplates);
  });

  it('appends new messages from socket correctly', async () => {
    const { rerender } = render(<MessageThread conversationId="conv_1" />);
    
    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });
    
    const newMsg = {
      conversation_id: "conv_1",
      message: {
        id: '3', text_body: 'Real time!', direction: 'INBOUND', sender_type: 'CUSTOMER', timestamp: '2023-01-01T10:10:00Z'
      }
    };
    
    rerender(<MessageThread conversationId="conv_1" newMessage={newMsg} />);

    await waitFor(() => {
      expect(screen.getByText('Real time!')).toBeInTheDocument();
    });
  });

  it('shows a status tick for an outbound agent message and updates it live from a socket status event', async () => {
    const defaultFetchImpl1 = (global.fetch as jest.Mock).getMockImplementation();
    (global.fetch as jest.Mock).mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/conv_1/messages')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'success',
            data: [
              {
                id: 'out-1',
                text_body: 'On our way!',
                direction: 'OUTBOUND',
                sender_type: 'AGENT',
                delivery_status: 'SENT',
                timestamp: '2023-01-01T10:00:00Z',
              },
            ],
          }),
        });
      }
      return defaultFetchImpl1!(url, opts);
    });

    const { rerender } = render(<MessageThread conversationId="conv_1" />);
    await waitFor(() => expect(screen.getByTitle('Sent')).toBeInTheDocument());

    rerender(
      <MessageThread
        conversationId="conv_1"
        messageStatusUpdate={{ conversation_id: 'conv_1', message_id: 'out-1', delivery_status: 'READ' }}
      />
    );

    await waitFor(() => expect(screen.getByTitle('Read')).toBeInTheDocument());
    (global.fetch as jest.Mock).mockImplementation(defaultFetchImpl1);
  });

  it('does not show a status tick for an inbound customer message', async () => {
    const defaultFetchImpl2 = (global.fetch as jest.Mock).getMockImplementation();
    (global.fetch as jest.Mock).mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/conv_1/messages')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'success',
            data: [
              {
                id: 'in-1',
                text_body: 'Hello there',
                direction: 'INBOUND',
                sender_type: 'CUSTOMER',
                delivery_status: 'DELIVERED',
                timestamp: '2023-01-01T10:00:00Z',
              },
            ],
          }),
        });
      }
      return defaultFetchImpl2!(url, opts);
    });

    render(<MessageThread conversationId="conv_1" />);
    await waitFor(() => expect(screen.getByText('Hello there')).toBeInTheDocument());
    expect(screen.queryByTitle('Delivered')).not.toBeInTheDocument();
    (global.fetch as jest.Mock).mockImplementation(defaultFetchImpl2);
  });

  it('renders a URL inside a received message as a clickable link', async () => {
    // The component also fires a quick-replies fetch on mount, so a plain
    // mockImplementationOnce could get consumed by that instead of the
    // messages fetch -- key off the URL to target the right request.
    const defaultFetchImpl = (global.fetch as jest.Mock).getMockImplementation();
    (global.fetch as jest.Mock).mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/conv_1/messages')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'success',
            data: [
              {
                id: '1',
                text_body: 'Please fill this out: https://example.com/form',
                direction: 'INBOUND',
                sender_type: 'CUSTOMER',
                timestamp: '2023-01-01T10:00:00Z',
              },
            ],
          }),
        });
      }
      return defaultFetchImpl!(url, opts);
    });

    render(<MessageThread conversationId="conv_1" />);

    const link = await screen.findByRole('link', { name: 'https://example.com/form' });
    expect(link).toHaveAttribute('href', 'https://example.com/form');
    expect(link).toHaveAttribute('target', '_blank');

    // mockImplementation (unlike mockImplementationOnce) persists across
    // tests even after clearAllMocks, so restore the shared default here.
    (global.fetch as jest.Mock).mockImplementation(defaultFetchImpl);
  });

  it('does not duplicate a sent note when the server echoes it back over the socket', async () => {
    const sentNote = {
      id: 'note-1', text_body: 'yay', direction: null, sender_type: 'INTERNAL_NOTE',
      message_type: 'TEXT', delivery_status: 'DELIVERED', timestamp: '2023-01-01T19:43:00Z'
    };

    // The backend emits the socketio broadcast BEFORE its HTTP response
    // returns (see add_note in conversations.py), so the sender's own socket
    // echo can legitimately arrive before the fetch() response does -- keep
    // the POST unresolved until after the socket echo lands, to test that
    // real ordering rather than assuming the HTTP response always wins.
    //
    // The component also fires unrelated fetches on mount (quick replies,
    // message history), so a plain mockImplementationOnce would get consumed
    // by one of those instead of the note POST -- key off the URL/method.
    let resolveNotePost!: (value: unknown) => void;
    const defaultFetchImpl = (global.fetch as jest.Mock).getMockImplementation();
    (global.fetch as jest.Mock).mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/notes') && opts?.method === 'POST') {
        return new Promise((resolve) => { resolveNotePost = resolve; });
      }
      return defaultFetchImpl!(url, opts);
    });

    const { rerender } = render(<MessageThread conversationId="conv_1" isNoteMode={true} />);
    await waitFor(() => expect(screen.getByText('Hello')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/type an internal note/i), { target: { value: 'yay' } });
    fireEvent.click(screen.getByRole('button', { name: /save note/i }));

    // The socketio broadcast (with no exclusion for the sender) arrives first.
    rerender(
      <MessageThread
        conversationId="conv_1"
        isNoteMode={true}
        newMessage={{ conversation_id: 'conv_1', message: sentNote }}
      />
    );
    await waitFor(() => {
      expect(screen.getAllByText('yay', { selector: 'p' })).toHaveLength(1);
    });

    // The direct POST response for the same note arrives after. It must not
    // render a second bubble. Resolving inside act() flushes the promise
    // chain (await res.json() -> setMessages) fully before we assert --
    // otherwise waitFor's first (synchronous) check can pass on stale DOM
    // before that chain has had a chance to run, masking the bug.
    await act(async () => {
      resolveNotePost({ ok: true, json: () => Promise.resolve({ status: 'success', data: sentNote }) });
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getAllByText('yay', { selector: 'p' })).toHaveLength(1);
  });
});
