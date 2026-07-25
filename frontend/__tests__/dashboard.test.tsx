import { render, screen, waitFor } from '@testing-library/react';
import DashboardPage from '@/app/dashboard/page';
import '@testing-library/jest-dom';

// Mock fetch for the API calls (auth verification + conversations fetch)
global.fetch = jest.fn((url: string) => {
  if (url.includes('/api/auth/me')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        status: 'success',
        data: { id: '1', email: 'agent@test.com', full_name: 'Test Agent', role: 'AGENT' }
      })
    });
  }
  if (url.includes('/api/conversations')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        status: 'success',
        data: [
          { id: '1', masked_id: 'Lead-123', unread_count: 1, last_message_preview: 'Hello' }
        ]
      })
    });
  }
  return Promise.reject(new Error('not found'));
}) as jest.Mock;

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/dashboard',
}));

describe('Dashboard Inbox UI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
  });

  it('renders the 3-pane layout securely masking customer data', async () => {
    render(<DashboardPage />);
    
    // Check loading state
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
    
    // Wait for data to load and render the Lead alias
    await waitFor(() => {
      expect(screen.getByText('Lead-123')).toBeInTheDocument();
    });
    
    // Check for the presence of the other panes
    expect(screen.getByText('Message History will appear here')).toBeInTheDocument();
    expect(screen.getByText('CRM Context')).toBeInTheDocument();
  });

  it('renders empty state when no conversations exist', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', data: { id: '1', email: 'agent@test.com', full_name: 'Test Agent', role: 'AGENT' } }) });
      if (url.includes('/api/conversations')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success', data: [] }) });
      return Promise.reject(new Error('not found'));
    });

    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('No conversations found')).toBeInTheDocument();
    });
  });

  it('redirects to login when session verification fails', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) return Promise.resolve({ ok: false, status: 401 });
      return Promise.reject(new Error('not found'));
    });

    render(<DashboardPage />);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });
});
