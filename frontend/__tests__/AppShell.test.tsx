import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
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

  it('logs out and redirects to login', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: { id: '1', email: 'admin@test.com', full_name: 'Ada Admin', role: 'ADMIN' } })
    }) as jest.Mock;

    render(<AppShell>{() => <div>Content</div>}</AppShell>);
    await waitFor(() => screen.getByText('Content'));

    const logoutButton = screen.getByTitle('Logout');
    logoutButton.click();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/logout'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});
