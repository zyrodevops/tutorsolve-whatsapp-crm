import '@testing-library/jest-dom'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import TagsPage from '@/app/admin/tags/page'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: () => '/admin/tags',
}))

const mockTags = [
  { id: 'tag1', name: 'VIP', color_hex: '#FF0000' },
];

const mockAdminUser = { id: '1', email: 'admin@test.com', full_name: 'Admin User', role: 'ADMIN' };
const mockAgentUser = { id: '2', email: 'agent@test.com', full_name: 'Agent User', role: 'AGENT' };

describe('Admin Tags Page', () => {
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the tag list', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockAdminUser }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockTags }) });
    });

    render(<TagsPage />)

    await waitFor(() => {
      expect(screen.getByText('VIP')).toBeInTheDocument();
    });
  });

  it('adds a new tag', async () => {
    global.fetch = jest.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockAdminUser }) });
      }
      if (opts?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success', data: { id: 'tag2', name: 'Billing', color_hex: '#00FF00' } })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: [] }) });
    });

    render(<TagsPage />)
    await waitFor(() => screen.getByRole('button', { name: /add tag/i }));

    fireEvent.click(screen.getByRole('button', { name: /add tag/i }));
    fireEvent.change(screen.getByLabelText(/tag name/i), { target: { value: 'Billing' } });
    fireEvent.click(screen.getByRole('button', { name: /save tag/i }));

    await waitFor(() => {
      expect(screen.getByText('Billing')).toBeInTheDocument();
    });
  });

  it('deletes a tag via confirmation', async () => {
    global.fetch = jest.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockAdminUser }) });
      }
      if (opts?.method === 'DELETE') {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockTags }) });
    });

    render(<TagsPage />)
    await waitFor(() => screen.getByText('VIP'));

    fireEvent.click(screen.getByTitle('Delete tag'));
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }));

    await waitFor(() => {
      expect(screen.queryByText('VIP')).not.toBeInTheDocument();
    });
  });

  it('shows a not-authorized message for non-admin roles', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockAgentUser }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: [] }) });
    });

    render(<TagsPage />)

    await waitFor(() => {
      expect(screen.getByText(/only administrators/i)).toBeInTheDocument();
    });
  });
})
