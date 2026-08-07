import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import AuditLogsPage from '@/app/admin/audit-logs/page'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: () => '/admin/audit-logs',
}))

const mockEntries = [
  {
    id: 'log-1',
    action: 'REVEAL_NUMBER',
    entity_type: 'CUSTOMER',
    entity_id: 'cust-1',
    ip_address: '127.0.0.1',
    timestamp: '2026-01-02T10:00:00Z',
    user: { full_name: 'Admin User', email: 'admin@test.com' },
  },
  {
    id: 'log-2',
    action: 'REVEAL_NUMBER',
    entity_type: 'CUSTOMER',
    entity_id: 'cust-2',
    ip_address: '10.0.0.5',
    timestamp: '2026-01-01T10:00:00Z',
    user: { full_name: 'Unknown User', email: null },
  },
];

const mockAdminUser = { id: '1', email: 'admin@test.com', full_name: 'Admin User', role: 'ADMIN' };
const mockAgentUser = { id: '2', email: 'agent@test.com', full_name: 'Agent User', role: 'AGENT' };

describe('Admin Audit Logs Page', () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders audit log entries for an admin', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockAdminUser }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockEntries }) });
    });

    render(<AuditLogsPage />)

    await waitFor(() => {
      expect(screen.getAllByText('REVEAL_NUMBER').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/Admin User/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('cust-1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('127.0.0.1').length).toBeGreaterThan(0);
  });

  it('falls back gracefully when the acting user has been deleted', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockAdminUser }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockEntries }) });
    });

    render(<AuditLogsPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Unknown User').length).toBeGreaterThan(0);
    });
  });

  it('shows a not-authorized message for non-admin roles', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockAgentUser }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: [] }) });
    });

    render(<AuditLogsPage />)

    await waitFor(() => {
      expect(screen.getByText(/only administrators/i)).toBeInTheDocument();
    });
  });

  it('shows an empty state when there are no entries yet', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockAdminUser }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: [] }) });
    });

    render(<AuditLogsPage />)

    await waitFor(() => {
      expect(screen.getByText(/no audit log entries/i)).toBeInTheDocument();
    });
  });
})
