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

describe('CrmSidebar Component - Assigned Agent', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows who the conversation is assigned to', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', data: [] }) })
    ) as jest.Mock;

    render(
      <CrmSidebar
        conversation={{ ...conversationA, assigned_agent_id: 'agent-1', assigned_agent_name: 'Jane Doe' }}
        currentUser={adminUser}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });
  });

  it('shows Unassigned when there is no assigned agent', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', data: [] }) })
    ) as jest.Mock;

    render(<CrmSidebar conversation={conversationA} currentUser={adminUser} />);

    await waitFor(() => {
      expect(screen.getByText(/unassigned/i)).toBeInTheDocument();
    });
  });
});

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

describe('CrmSidebar Component - Quick Actions', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('calls onAddNote when the Add Note quick action is clicked', () => {
    const onAddNote = jest.fn();
    render(<CrmSidebar conversation={conversationA} currentUser={adminUser} onAddNote={onAddNote} />);

    const addNoteButton = screen.getByRole('button', { name: /add note/i });
    expect(addNoteButton).not.toBeDisabled();

    fireEvent.click(addNoteButton);
    expect(onAddNote).toHaveBeenCalledTimes(1);
  });

  it('asks for confirmation before marking resolved, and does nothing on cancel', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', data: [] }) })
    ) as jest.Mock;
    const onStatusChange = jest.fn();

    render(<CrmSidebar conversation={conversationA} currentUser={adminUser} onStatusChange={onStatusChange} />);

    fireEvent.click(screen.getByRole('button', { name: /mark resolved/i }));
    expect(screen.getByText(/mark this conversation as resolved/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));

    expect(screen.queryByText(/mark this conversation as resolved/i)).not.toBeInTheDocument();
    // The mount-time tag-catalog fetch is expected -- but cancelling must not
    // trigger a status-update PATCH.
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/status'),
      expect.objectContaining({ method: 'PATCH' })
    );
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('marks the conversation resolved and reports the new status to the parent after confirming', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', data: { status: 'RESOLVED' } }) })
    ) as jest.Mock;
    const onStatusChange = jest.fn();

    render(<CrmSidebar conversation={conversationA} currentUser={adminUser} onStatusChange={onStatusChange} />);

    fireEvent.click(screen.getByRole('button', { name: /mark resolved/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Yes, Mark Resolved$/i }));

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledWith('conv_a', 'RESOLVED');
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/conversations/conv_a/status'),
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('shows an inline error and does not call onStatusChange when marking resolved fails', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({ message: 'Server error' }) })
    ) as jest.Mock;
    const onStatusChange = jest.fn();

    render(<CrmSidebar conversation={conversationA} currentUser={adminUser} onStatusChange={onStatusChange} />);
    fireEvent.click(screen.getByRole('button', { name: /mark resolved/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Yes, Mark Resolved$/i }));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('disables Mark Resolved when the conversation is already resolved', () => {
    render(<CrmSidebar conversation={{ ...conversationA, status: 'RESOLVED' }} currentUser={adminUser} />);
    expect(screen.getByRole('button', { name: /mark resolved/i })).toBeDisabled();
  });
});

describe('CrmSidebar Component - Tags', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('picks a tag from the managed catalog and reports the updated list to the parent', async () => {
    global.fetch = jest.fn((url: string, opts?: RequestInit) => {
      if (url.includes('/api/admin/tags')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'success', data: [{ id: 't1', name: 'VIP', color_hex: '#FF0000' }] }),
        });
      }
      if (opts?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', data: { tags: ['VIP'] } }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', data: {} }) });
    }) as jest.Mock;
    const onTagsChange = jest.fn();

    render(<CrmSidebar conversation={conversationA} currentUser={adminUser} onTagsChange={onTagsChange} />);

    fireEvent.click(screen.getByRole('button', { name: /\+ add/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'VIP' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'VIP' }));

    await waitFor(() => {
      expect(onTagsChange).toHaveBeenCalledWith('conv_a', ['VIP']);
    });
    const putCall = (global.fetch as jest.Mock).mock.calls.find((c) => c[1]?.method === 'PUT');
    expect(JSON.parse(putCall[1].body)).toEqual({ tags: ['VIP'] });
  });

  it('does not offer an already-applied tag as a pickable option', async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('/api/admin/tags')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'success',
            data: [
              { id: 't1', name: 'VIP', color_hex: '#FF0000' },
              { id: 't2', name: 'Billing', color_hex: '#00FF00' },
            ],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', data: {} }) });
    }) as jest.Mock;

    render(<CrmSidebar conversation={{ ...conversationA, tags: ['VIP'] }} currentUser={adminUser} />);

    fireEvent.click(screen.getByRole('button', { name: /\+ add/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Billing' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'VIP' })).not.toBeInTheDocument();
  });

  it('shows a helpful message when no tags have been configured yet', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', data: [] }) })
    ) as jest.Mock;

    render(<CrmSidebar conversation={conversationA} currentUser={adminUser} />);

    fireEvent.click(screen.getByRole('button', { name: /\+ add/i }));
    await waitFor(() => {
      expect(screen.getByText(/no tags configured/i)).toBeInTheDocument();
    });
  });

  it('reports the updated tag list to the parent after removing a tag', async () => {
    global.fetch = jest.fn((url: string, opts?: RequestInit) => {
      if (url.includes('/api/admin/tags')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', data: [] }) });
      }
      if (opts?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', data: { tags: [] } }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', data: {} }) });
    }) as jest.Mock;
    const onTagsChange = jest.fn();

    render(
      <CrmSidebar
        conversation={{ ...conversationA, tags: ['VIP'] }}
        currentUser={adminUser}
        onTagsChange={onTagsChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /remove tag "vip"/i }));

    await waitFor(() => {
      expect(onTagsChange).toHaveBeenCalledWith('conv_a', []);
    });
  });
});
