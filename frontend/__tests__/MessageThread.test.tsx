import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
