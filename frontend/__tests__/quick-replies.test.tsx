import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import QuickRepliesPage from '@/app/admin/quick-replies/page'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: () => '/admin/quick-replies',
}))

const mockReplies = [
  { id: 'r1', shortcut: 'hello', message: 'Hi there! How can I help you?', created_at: '2024-01-01T00:00:00Z' },
];

const mockCurrentUser = { id: '1', email: 'admin@test.com', full_name: 'Ada Admin', role: 'ADMIN' };

describe('Quick Replies Page', () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    global.fetch = jest.fn().mockImplementation((url: string, options) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockCurrentUser }) });
      }
      if (options?.method === 'DELETE') {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success' }) });
      }
      if (options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', data: { id: 'r2', shortcut: 'bye', message: 'Goodbye!' } })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockReplies }) });
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders a delete button that is not hidden behind a hover-only state (broken on touch devices)', async () => {
    render(<QuickRepliesPage />)
    await waitFor(() => screen.getByText('/hello'));

    const deleteButton = screen.getByTitle('Delete shortcut');
    expect(deleteButton.className).not.toMatch(/opacity-0/);
  });

  it('deletes a quick reply via a confirmation modal, not a native confirm()', async () => {
    render(<QuickRepliesPage />)
    await waitFor(() => screen.getByText('/hello'));

    fireEvent.click(screen.getByTitle('Delete shortcut'));

    // A real modal renders instead of a native confirm() dialog.
    expect(screen.getByText('Delete this quick reply?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }));

    await waitFor(() => {
      expect(screen.queryByText('/hello')).not.toBeInTheDocument();
    });
  });

  it('cancels the delete confirmation without deleting', async () => {
    render(<QuickRepliesPage />)
    await waitFor(() => screen.getByText('/hello'));

    fireEvent.click(screen.getByTitle('Delete shortcut'));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

    expect(screen.queryByText('Delete this quick reply?')).not.toBeInTheDocument();
    expect(screen.getByText('/hello')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/r1'), expect.anything());
  });

  it('shows an inline error banner (not a native alert()) when delete fails', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string, options) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockCurrentUser }) });
      }
      if (options?.method === 'DELETE') {
        return Promise.resolve({ ok: false, json: async () => ({ message: 'nope' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockReplies }) });
    });
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});

    render(<QuickRepliesPage />)
    await waitFor(() => screen.getByText('/hello'));

    fireEvent.click(screen.getByTitle('Delete shortcut'));
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }));

    await waitFor(() => {
      expect(screen.getByText('Failed to delete quick reply.')).toBeInTheDocument();
    });
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('opens Add Shortcut as an overlay modal, not an inline card', async () => {
    const { container } = render(<QuickRepliesPage />)
    await waitFor(() => screen.getByText('/hello'));

    expect(container.querySelector('.fixed.inset-0')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Add Shortcut/i }));

    expect(container.querySelector('.fixed.inset-0')).toBeInTheDocument();
    expect(screen.getByText('Add Shortcut', { selector: 'h2' })).toBeInTheDocument();
  });

  it('closes the Add Shortcut modal on backdrop click but not on inside click, and clears the form', async () => {
    const { container } = render(<QuickRepliesPage />)
    await waitFor(() => screen.getByText('/hello'));

    fireEvent.click(screen.getByRole('button', { name: /Add Shortcut/i }));
    fireEvent.change(screen.getByPlaceholderText('shortcut'), { target: { value: 'stale' } });

    const backdrop = container.querySelector('.fixed.inset-0') as HTMLElement;
    const card = backdrop.firstElementChild as HTMLElement;
    fireEvent.click(card);
    expect(screen.getByPlaceholderText('shortcut')).toBeInTheDocument();

    fireEvent.click(backdrop);
    expect(container.querySelector('.fixed.inset-0')).not.toBeInTheDocument();

    // Reopen -- must not show the stale value typed before closing.
    fireEvent.click(screen.getByRole('button', { name: /Add Shortcut/i }));
    expect(screen.getByPlaceholderText('shortcut')).toHaveValue('');
  });

  it('shows an inline form error (not a native alert()) when adding a shortcut fails', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string, options) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockCurrentUser }) });
      }
      if (options?.method === 'POST') {
        return Promise.resolve({ ok: false, json: async () => ({ message: 'Shortcut already exists' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockReplies }) });
    });
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});

    render(<QuickRepliesPage />)
    await waitFor(() => screen.getByText('/hello'));

    fireEvent.click(screen.getByRole('button', { name: /Add Shortcut/i }));
    fireEvent.change(screen.getByPlaceholderText('shortcut'), { target: { value: 'hello' } });
    fireEvent.change(screen.getByPlaceholderText('Hi there! How can we help you today?'), { target: { value: 'Hi!' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Quick Reply/i }));

    await waitFor(() => {
      expect(screen.getByText('Shortcut already exists')).toBeInTheDocument();
    });
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
