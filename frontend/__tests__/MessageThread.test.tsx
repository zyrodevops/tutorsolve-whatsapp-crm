import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
    const futureIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
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
});
