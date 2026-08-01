import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import LoginPage from '@/app/login/page'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

describe('Login Page', () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    global.fetch = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the login form', () => {
    render(<LoginPage />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign in to your account')
  })

  it('shows error message on failed login', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Invalid credentials' }),
    });

    render(<LoginPage />)

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('shows a loading spinner on the submit button while the request is in flight', async () => {
    let resolveFetch: (value: unknown) => void;
    (global.fetch as jest.Mock).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));

    render(<LoginPage />)

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));

    const submitButton = screen.getByRole('button', { name: /Sign in/i });
    await waitFor(() => {
      expect(submitButton.querySelector('.animate-spin')).toBeInTheDocument();
    });

    resolveFetch!({ ok: true, json: async () => ({ status: 'success', data: { user: { role: 'AGENT' } } }) });
  });

  it('redirects to admin team page for ADMIN role', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: { user: { role: 'ADMIN' } } }),
    });

    render(<LoginPage />)

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'admin@test.com' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/admin/team');
    });
  });

  it('redirects to dashboard for AGENT role', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: { user: { role: 'AGENT' } } }),
    });

    render(<LoginPage />)

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'agent@test.com' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });
})
