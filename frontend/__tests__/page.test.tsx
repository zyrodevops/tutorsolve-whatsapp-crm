import { render, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import Page from '@/app/page'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

describe('Home Page', () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to the login page when the session check fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 }) as jest.Mock;

    render(<Page />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  it('routes admins to the analytics dashboard', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: { id: '1', email: 'admin@test.com', full_name: 'Ada Admin', role: 'ADMIN' } })
    }) as jest.Mock;

    render(<Page />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/admin/analytics');
    });
  });

  it('routes non-admins (agents/managers) to the shared inbox dashboard', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: { id: '2', email: 'agent@test.com', full_name: 'Ann Agent', role: 'AGENT' } })
    }) as jest.Mock;

    render(<Page />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });
})
