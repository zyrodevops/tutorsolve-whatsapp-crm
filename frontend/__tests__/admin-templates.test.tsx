import '@testing-library/jest-dom'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import TemplatesPage from '@/app/admin/templates/page'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: () => '/admin/templates',
}))

const mockTemplates = [
  { id: 't1', template_name: 'hello_world', meta_template_id: '9988776655', language_code: 'en_US', status: 'APPROVED', body: 'Hello there!' },
];

const mockAdminUser = { id: '1', email: 'admin@test.com', full_name: 'Admin User', role: 'ADMIN' };
const mockAgentUser = { id: '2', email: 'agent@test.com', full_name: 'Agent User', role: 'AGENT' };

describe('Admin Meta Templates Page', () => {
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the template list', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockAdminUser }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockTemplates }) });
    });

    render(<TemplatesPage />)

    await waitFor(() => {
      expect(screen.getByText('hello_world')).toBeInTheDocument();
    });
    expect(screen.getByText('en_US')).toBeInTheDocument();
    expect(screen.getByText('Hello there!')).toBeInTheDocument();
  });

  it('adds a new template', async () => {
    global.fetch = jest.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockAdminUser }) });
      }
      if (opts?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'success',
            data: { id: 't2', template_name: 'order_update', meta_template_id: '1122334455', language_code: 'en_US', status: 'APPROVED', body: 'Your order shipped' }
          })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: [] }) });
    });

    render(<TemplatesPage />)
    await waitFor(() => screen.getByRole('button', { name: /add template/i }));

    fireEvent.click(screen.getByRole('button', { name: /add template/i }));
    fireEvent.change(screen.getByLabelText(/template name/i), { target: { value: 'order_update' } });
    fireEvent.change(screen.getByLabelText(/language code/i), { target: { value: 'en_US' } });
    fireEvent.change(screen.getByLabelText(/^body/i), { target: { value: 'Your order shipped' } });
    fireEvent.click(screen.getByRole('button', { name: /save template/i }));

    await waitFor(() => {
      expect(screen.getByText('order_update')).toBeInTheDocument();
    });
  });

  it('deletes a template via confirmation', async () => {
    global.fetch = jest.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockAdminUser }) });
      }
      if (opts?.method === 'DELETE') {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockTemplates }) });
    });

    render(<TemplatesPage />)
    await waitFor(() => screen.getByText('hello_world'));

    fireEvent.click(screen.getByTitle('Delete template'));
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }));

    await waitFor(() => {
      expect(screen.queryByText('hello_world')).not.toBeInTheDocument();
    });
  });

  it('shows a not-authorized message for non-admin roles', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockAgentUser }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: [] }) });
    });

    render(<TemplatesPage />)

    await waitFor(() => {
      expect(screen.getByText(/only administrators/i)).toBeInTheDocument();
    });
  });
})
