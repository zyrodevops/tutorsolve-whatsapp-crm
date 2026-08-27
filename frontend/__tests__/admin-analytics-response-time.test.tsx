import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import AnalyticsPage from '@/app/admin/analytics/page'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: () => '/admin/analytics',
}))

const mockAdminUser = { id: '1', email: 'admin@test.com', full_name: 'Admin User', role: 'ADMIN' };

describe('Admin Analytics Page - Avg Response Time', () => {
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the average response time formatted as minutes', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockAdminUser }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          status: 'success',
          data: {
            total_agents: 2, online_agents: 1, total_conversations: 5,
            open_conversations: 2, resolved_conversations: 3,
            avg_response_time_seconds: 185,
          },
        }),
      });
    });

    render(<AnalyticsPage />)

    await waitFor(() => {
      expect(screen.getByText(/3m/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Avg\.? Response Time/i)).toBeInTheDocument();
  });

  it('renders hours and minutes for longer response times', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockAdminUser }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          status: 'success',
          data: {
            total_agents: 2, online_agents: 1, total_conversations: 5,
            open_conversations: 2, resolved_conversations: 3,
            avg_response_time_seconds: 3900, // 1h 5m
          },
        }),
      });
    });

    render(<AnalyticsPage />)

    await waitFor(() => {
      expect(screen.getByText(/1h 5m/)).toBeInTheDocument();
    });
  });

  it('shows a placeholder when there is no response-time data yet', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockAdminUser }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          status: 'success',
          data: {
            total_agents: 2, online_agents: 1, total_conversations: 5,
            open_conversations: 2, resolved_conversations: 3,
            avg_response_time_seconds: null,
          },
        }),
      });
    });

    render(<AnalyticsPage />)

    await waitFor(() => {
      expect(screen.getByText(/Avg\.? Response Time/i)).toBeInTheDocument();
    });
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });
});
