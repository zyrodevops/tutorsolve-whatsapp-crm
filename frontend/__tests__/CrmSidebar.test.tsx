import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CrmSidebar from '../src/components/inbox/CrmSidebar';
import type { Conversation } from '../src/types/inbox';
import type { CurrentUser } from '../src/types/auth';

const adminUser: CurrentUser = {
  id: 'u1',
  email: 'admin@crm.com',
  full_name: 'Admin User',
  role: 'ADMIN',
};

const conversationA: Conversation = {
  id: 'conv_a',
  status: 'OPEN',
  unread_count: 0,
  last_message_preview: null,
  last_message_at: null,
  assigned_agent_id: null,
  masked_id: 'Lead-AAAA',
  whatsapp_name: 'Customer A',
  profile_photo_url: null,
};

const conversationB: Conversation = {
  id: 'conv_b',
  status: 'OPEN',
  unread_count: 0,
  last_message_preview: null,
  last_message_at: null,
  assigned_agent_id: null,
  masked_id: 'Lead-BBBB',
  whatsapp_name: 'Customer B',
  profile_photo_url: null,
};

describe('CrmSidebar Component - PII isolation across conversations', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does not leak a previously revealed phone number into a different conversation', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: { real_phone_number: '+15550001111' } }),
      })
    ) as jest.Mock;

    const { rerender } = render(<CrmSidebar conversation={conversationA} currentUser={adminUser} />);

    const revealButton = screen.getByRole('button', { name: /reveal number/i });
    fireEvent.click(revealButton);

    await waitFor(() => {
      expect(screen.getByText('+15550001111')).toBeInTheDocument();
    });

    // Agent switches to a different conversation.
    rerender(<CrmSidebar conversation={conversationB} currentUser={adminUser} />);

    expect(screen.queryByText('+15550001111')).not.toBeInTheDocument();
    expect(screen.getByText('Lead-BBBB')).toBeInTheDocument();
  });
});
