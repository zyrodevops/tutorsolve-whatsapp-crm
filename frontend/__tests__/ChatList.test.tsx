import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChatList from '../src/components/inbox/ChatList';
import type { Conversation } from '../src/types/inbox';

function makeConversation(overrides: Partial<Conversation>): Conversation {
  return {
    id: 'conv_default',
    status: 'OPEN',
    unread_count: 0,
    last_message_preview: null,
    last_message_at: null,
    assigned_agent_id: null,
    masked_id: 'Lead-0000',
    whatsapp_name: null,
    profile_photo_url: null,
    tags: [],
    ...overrides,
  };
}

describe('ChatList Component - Assigned Agent', () => {
  it('shows who a conversation is assigned to', () => {
    const conversations = [
      makeConversation({ id: 'conv_a', whatsapp_name: 'Customer A', assigned_agent_id: 'agent-1', assigned_agent_name: 'Jane Doe' }),
    ];
    render(<ChatList conversations={conversations} selectedId={null} onSelect={jest.fn()} />);

    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
  });

  it('shows nothing for an unassigned conversation', () => {
    const conversations = [
      makeConversation({ id: 'conv_a', whatsapp_name: 'Customer A', assigned_agent_id: null, assigned_agent_name: null }),
    ];
    render(<ChatList conversations={conversations} selectedId={null} onSelect={jest.fn()} />);

    expect(screen.queryByText(/Assigned to/i)).not.toBeInTheDocument();
  });
});

describe('ChatList Component - Tags', () => {
  it('renders tag chips on a conversation row', () => {
    const conversations = [
      makeConversation({ id: 'conv_a', whatsapp_name: 'Customer A', tags: ['VIP', 'Billing'] }),
    ];
    render(<ChatList conversations={conversations} selectedId={null} onSelect={jest.fn()} />);

    // Each tag renders twice: once as a row chip (span), once as a filter pill (button).
    expect(screen.getAllByText('VIP')).toHaveLength(2);
    expect(screen.getAllByText('Billing')).toHaveLength(2);
  });

  it('does not render a tag filter bar when no conversations have tags', () => {
    const conversations = [makeConversation({ id: 'conv_a', whatsapp_name: 'Customer A', tags: [] })];
    render(<ChatList conversations={conversations} selectedId={null} onSelect={jest.fn()} />);

    expect(screen.queryByRole('button', { name: 'VIP' })).not.toBeInTheDocument();
  });

  it('renders a tag filter pill for each distinct tag across all conversations', () => {
    const conversations = [
      makeConversation({ id: 'conv_a', whatsapp_name: 'Customer A', tags: ['VIP'] }),
      makeConversation({ id: 'conv_b', whatsapp_name: 'Customer B', tags: ['Billing'] }),
      makeConversation({ id: 'conv_c', whatsapp_name: 'Customer C', tags: ['VIP'] }),
    ];
    render(<ChatList conversations={conversations} selectedId={null} onSelect={jest.fn()} />);

    // One filter pill per distinct tag, not one per conversation.
    expect(screen.getByRole('button', { name: 'VIP' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Billing' })).toBeInTheDocument();
  });

  it('filters the conversation list down to conversations carrying the selected tag', () => {
    const conversations = [
      makeConversation({ id: 'conv_a', whatsapp_name: 'Customer A', tags: ['VIP'] }),
      makeConversation({ id: 'conv_b', whatsapp_name: 'Customer B', tags: ['Billing'] }),
    ];
    render(<ChatList conversations={conversations} selectedId={null} onSelect={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'VIP' }));

    expect(screen.getByText('Customer A')).toBeInTheDocument();
    expect(screen.queryByText('Customer B')).not.toBeInTheDocument();
  });

  it('clears the tag filter when the active tag pill is clicked again', () => {
    const conversations = [
      makeConversation({ id: 'conv_a', whatsapp_name: 'Customer A', tags: ['VIP'] }),
      makeConversation({ id: 'conv_b', whatsapp_name: 'Customer B', tags: ['Billing'] }),
    ];
    render(<ChatList conversations={conversations} selectedId={null} onSelect={jest.fn()} />);

    const vipPill = screen.getByRole('button', { name: 'VIP' });
    fireEvent.click(vipPill);
    expect(screen.queryByText('Customer B')).not.toBeInTheDocument();

    fireEvent.click(vipPill);
    expect(screen.getByText('Customer B')).toBeInTheDocument();
  });

  it('combines the tag filter with the search query', () => {
    const conversations = [
      makeConversation({ id: 'conv_a', whatsapp_name: 'Alice', tags: ['VIP'] }),
      makeConversation({ id: 'conv_b', whatsapp_name: 'Bob', tags: ['VIP'] }),
    ];
    render(<ChatList conversations={conversations} selectedId={null} onSelect={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'VIP' }));
    fireEvent.change(screen.getByPlaceholderText(/search leads/i), { target: { value: 'Alice' } });

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
  });
});
