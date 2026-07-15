import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import TeamManagementPage from '@/app/admin/team/page'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

const mockUsers = [
  { id: '1', full_name: 'Admin User', email: 'admin@test.com', role: 'ADMIN', system_status: 'ACTIVE' },
  { id: '2', full_name: 'Agent Bob', email: 'bob@test.com', role: 'AGENT', system_status: 'INACTIVE' }
];

describe('Admin Team Management Page', () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    global.fetch = jest.fn().mockImplementation((url, options) => {
      if (options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'success' })
        });
      }
      // Default to GET
      return Promise.resolve({
        ok: true,
        json: async () => ({ status: 'success', data: mockUsers })
      });
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the team list automatically', async () => {
    render(<TeamManagementPage />)
    
    // Wait for users to load
    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });
    
    expect(screen.getByText('admin@test.com')).toBeInTheDocument();
    expect(screen.getByText('Agent Bob')).toBeInTheDocument();
  })

  it('toggles the Add Employee modal', async () => {
    render(<TeamManagementPage />)
    await waitFor(() => screen.getByText('Admin User'));
    
    // Modal is initially hidden
    expect(screen.queryByText('Create New User')).not.toBeInTheDocument()

    // Open modal
    fireEvent.click(screen.getByRole('button', { name: /Add Employee/i }))
    expect(screen.getByText('Create New User')).toBeInTheDocument()

    // Close modal
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(screen.queryByText('Create New User')).not.toBeInTheDocument()
  })

  it('shows error on failed user creation', async () => {
    (global.fetch as jest.Mock).mockImplementation((url, options) => {
      if (options?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          json: async () => ({ message: 'Email already exists' })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockUsers }) });
    });

    render(<TeamManagementPage />)
    await waitFor(() => screen.getByText('Admin User'));
    
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
