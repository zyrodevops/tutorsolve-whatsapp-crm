import '@testing-library/jest-dom'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: () => '/dashboard',
}))

describe('AppShell', () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows a loading state while verifying the session', () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as jest.Mock;
    render(<AppShell>{() => <div>Content</div>}</AppShell>);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it('redirects to login when session verification fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 }) as jest.Mock;
    render(<AppShell>{() => <div>Content</div>}</AppShell>);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  it('renders children with the resolved user once authenticated', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: { id: '1', email: 'agent@test.com', full_name: 'Ann Agent', role: 'AGENT' } })
    }) as jest.Mock;

    render(<AppShell>{(user) => <div>Hello {user.full_name}</div>}</AppShell>);

    await waitFor(() => {
      expect(screen.getByText('Hello Ann Agent')).toBeInTheDocument();
    });
  });

  it('only shows the Team nav link to admins', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: { id: '1', email: 'agent@test.com', full_name: 'Ann Agent', role: 'AGENT' } })
    }) as jest.Mock;

    render(<AppShell>{() => <div>Content</div>}</AppShell>);

    await waitFor(() => screen.getByText('Content'));
    expect(screen.queryByTitle('Team')).not.toBeInTheDocument();
    expect(screen.getByTitle('Inbox')).toBeInTheDocument();
  });

  it('shows the Team nav link to admins', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: { id: '1', email: 'admin@test.com', full_name: 'Ada Admin', role: 'ADMIN' } })
    }) as jest.Mock;

    render(<AppShell>{() => <div>Content</div>}</AppShell>);

    await waitFor(() => screen.getByText('Content'));
    expect(screen.getByTitle('Team')).toBeInTheDocument();
  });

  it('does not show the Quick Replies nav link to managers (the page itself is admin-only)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: { id: '1', email: 'manager@test.com', full_name: 'Mo Manager', role: 'MANAGER' } })
    }) as jest.Mock;

    render(<AppShell>{() => <div>Content</div>}</AppShell>);

    await waitFor(() => screen.getByText('Content'));
    // admin/quick-replies/page.tsx only renders QuickRepliesContent for ADMIN,
    // so showing this link to MANAGER would be a dead end.
    expect(screen.queryByTitle('Quick Replies')).not.toBeInTheDocument();
  });

  it('shows the Quick Replies nav link to admins', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: { id: '1', email: 'admin@test.com', full_name: 'Ada Admin', role: 'ADMIN' } })
    }) as jest.Mock;

    render(<AppShell>{() => <div>Content</div>}</AppShell>);

    await waitFor(() => screen.getByText('Content'));
    expect(screen.getByTitle('Quick Replies')).toBeInTheDocument();
  });

  it('uses a short mobile label for Quick Replies so it does not wrap onto two lines in the bottom nav', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: { id: '1', email: 'admin@test.com', full_name: 'Ada Admin', role: 'ADMIN' } })
    }) as jest.Mock;

    render(<AppShell>{() => <div>Content</div>}</AppShell>);

    await waitFor(() => screen.getByText('Content'));
    const link = screen.getByTitle('Quick Replies');
    // Full label stays on the tooltip/title for accessibility and desktop,
    // but the visible mobile text must be short enough not to wrap in the
    // narrow bottom-nav slot (unlike "Team" or "Inbox", "Quick Replies" does).
    expect(link).toHaveAttribute('title', 'Quick Replies');
    expect(link.textContent).not.toContain('Quick Replies');
  });

  it('closes the status menu when clicking outside the nav', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: { id: '1', email: 'admin@test.com', full_name: 'Ada Admin', role: 'ADMIN' } })
    }) as jest.Mock;

    render(<AppShell>{() => <div>Content</div>}</AppShell>);
    await waitFor(() => screen.getByText('Content'));

    const profileButton = screen.getByTitle('Ada Admin (ADMIN) - OFFLINE');
    fireEvent.click(profileButton);
    expect(screen.getAllByRole('button', { name: /^Online$/i }).length).toBeGreaterThan(0);

    // Clicking the page content (outside the nav entirely) must close it --
    // previously the only way to close was the toggle button or the X.
    fireEvent.mouseDown(screen.getByText('Content'));

    expect(screen.queryAllByRole('button', { name: /^Online$/i }).length).toBe(0);
  });

  it('does not close the status menu when clicking inside it', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: { id: '1', email: 'admin@test.com', full_name: 'Ada Admin', role: 'ADMIN' } })
    }) as jest.Mock;

    render(<AppShell>{() => <div>Content</div>}</AppShell>);
    await waitFor(() => screen.getByText('Content'));

    fireEvent.click(screen.getByTitle('Ada Admin (ADMIN) - OFFLINE'));
    const onlineButtons = screen.getAllByRole('button', { name: /^Online$/i });

    fireEvent.mouseDown(onlineButtons[0]);
    // The click itself (handleUpdateStatus) is a separate concern covered
    // elsewhere; here we only care that the outside-click handler doesn't
    // spuriously fire for a click that's inside the nav.
    expect(screen.getAllByRole('button', { name: /Busy/i }).length).toBeGreaterThan(0);
  });

  it('logs out and redirects to login', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: { id: '1', email: 'admin@test.com', full_name: 'Ada Admin', role: 'ADMIN' } })
    }) as jest.Mock;

    render(<AppShell>{() => <div>Content</div>}</AppShell>);
    await waitFor(() => screen.getByText('Content'));

    // Logout lives inside the profile status menu, which starts closed.
    const profileButton = screen.getByTitle('Ada Admin (ADMIN) - OFFLINE');
    fireEvent.click(profileButton);

    // The Logout button has no title attribute (just visible text), and both
    // the desktop and mobile status menus render once open (jsdom doesn't
    // evaluate the Tailwind responsive "hidden" classes that pick between
    // them at real viewport widths), so there are two matches here.
    const logoutButtons = await screen.findAllByRole('button', { name: /logout/i });
    fireEvent.click(logoutButtons[0]);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/logout'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});
