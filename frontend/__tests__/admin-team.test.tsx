import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import TeamManagementPage from '@/app/admin/team/page'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: () => '/admin/team',
}))

const mockUsers = [
  { id: '1', full_name: 'Admin User', email: 'admin@test.com', role: 'ADMIN', system_status: 'ACTIVE' },
  { id: '2', full_name: 'Agent Bob', email: 'bob@test.com', role: 'AGENT', system_status: 'INACTIVE' }
];

const mockCurrentUser = { id: '1', email: 'admin@test.com', full_name: 'Admin User', role: 'ADMIN' };

describe('Admin Team Management Page', () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    global.fetch = jest.fn().mockImplementation((url: string, options) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockCurrentUser }) });
      }
      if (options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success' })
        });
      }
      // Default to GET /api/users
      return Promise.resolve({
        ok: true,
        json: async () => ({ status: 'success', data: mockUsers })
      });
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // The page renders both a desktop table and a mobile card list for the same
  // data (only one is visible at a real viewport width via responsive CSS
  // classes, which jsdom doesn't evaluate), so every name/email appears twice.

  it('renders the team list automatically', async () => {
    render(<TeamManagementPage />)

    // Wait for users to load
    await waitFor(() => {
      expect(screen.getAllByText('Admin User').length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText('admin@test.com').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Agent Bob').length).toBeGreaterThan(0);
  })

  it('toggles the Add Employee modal', async () => {
    render(<TeamManagementPage />)
    await waitFor(() => screen.getAllByText('Admin User')[0]);
    
    // Modal is initially hidden
    expect(screen.queryByText('Create New User')).not.toBeInTheDocument()

    // Open modal
    fireEvent.click(screen.getByRole('button', { name: /Add Employee/i }))
    expect(screen.getByText('Create New User')).toBeInTheDocument()

    // Close modal
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(screen.queryByText('Create New User')).not.toBeInTheDocument()
  })

  it('clears the Create New User form after Cancel and reopening', async () => {
    render(<TeamManagementPage />)
    await waitFor(() => screen.getAllByText('Admin User')[0]);

    fireEvent.click(screen.getByRole('button', { name: /Add Employee/i }))
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Stale Data' } });

    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))

    // Reopen
    fireEvent.click(screen.getByRole('button', { name: /Add Employee/i }))
    expect(screen.getByLabelText(/Full Name/i)).toHaveValue('');
  })

  it('closes the Add Employee modal when clicking the backdrop, but not when clicking inside the card', async () => {
    const { container } = render(<TeamManagementPage />)
    await waitFor(() => screen.getAllByText('Admin User')[0]);

    fireEvent.click(screen.getByRole('button', { name: /Add Employee/i }))
    expect(screen.getByText('Create New User')).toBeInTheDocument()

    // Clicking inside the card must not close it.
    fireEvent.click(screen.getByText('Create New User'));
    expect(screen.getByText('Create New User')).toBeInTheDocument()

    // Clicking the backdrop itself must close it.
    const backdrop = container.querySelector('.fixed.inset-0.z-50') as HTMLElement;
    fireEvent.click(backdrop);
    expect(screen.queryByText('Create New User')).not.toBeInTheDocument()
  })

  it('deletes a team member via the confirmation modal', async () => {
    render(<TeamManagementPage />)
    await waitFor(() => screen.getAllByText('Agent Bob')[0]);

    const deleteButtons = screen.getAllByTitle('Delete User');
    fireEvent.click(deleteButtons[0]);

    expect(screen.getByText('Remove team member?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Remove$/i }));

    await waitFor(() => {
      expect(screen.getByText('User deleted successfully')).toBeInTheDocument();
    });
  })

  it('shows error on failed user creation', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string, options) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockCurrentUser }) });
      }
      if (options?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          json: async () => ({ message: 'Email already exists' })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockUsers }) });
    });

    render(<TeamManagementPage />)
    await waitFor(() => screen.getAllByText('Admin User')[0]);

    fireEvent.click(screen.getByRole('button', { name: /Add Employee/i }))

    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: 'jane@test.com' } });
    fireEvent.change(screen.getByLabelText(/Temporary Password/i), { target: { value: 'pass' } });
    
    fireEvent.click(screen.getByRole('button', { name: /Create User/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Email already exists')[0]).toBeInTheDocument();
    });
    
    // Modal remains open on error
    expect(screen.getByText('Create New User')).toBeInTheDocument();
  })
})
