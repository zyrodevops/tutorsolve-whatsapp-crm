import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import DashboardPage from '@/app/dashboard/page'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

describe('Agent Dashboard Page', () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the dashboard once the session is verified', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: { role: 'AGENT' } })
    });

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Agent Dashboard')).toBeInTheDocument();
    });

    expect(mockPush).not.toHaveBeenCalled();
  })

  it('redirects to login when the session is invalid', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ status: 'error', message: 'Missing authentication cookie' })
    });

    render(<DashboardPage />)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });

    expect(screen.queryByText('Agent Dashboard')).not.toBeInTheDocument();
  })
})
