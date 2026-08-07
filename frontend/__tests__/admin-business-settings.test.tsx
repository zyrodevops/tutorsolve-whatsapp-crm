import '@testing-library/jest-dom'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import BusinessSettingsPage from '@/app/admin/settings/page'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: () => '/admin/settings',
}))

const mockAdminUser = { id: '1', email: 'admin@test.com', full_name: 'Admin User', role: 'ADMIN' };
const mockAgentUser = { id: '2', email: 'agent@test.com', full_name: 'Agent User', role: 'AGENT' };

const mockSettings = {
  business_hours_start: '09:00',
  business_hours_end: '17:00',
  timezone: 'UTC',
  out_of_office_message: "We're closed right now.",
  first_greeting_message: 'Welcome!',
  round_robin_enabled: true,
};

describe('Admin Business Settings Page - Meta sync disclaimer', () => {
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('makes clear these settings are not synced with the real Meta Business Profile', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockAdminUser }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockSettings }) });
    });

    render(<BusinessSettingsPage />)
    await waitFor(() => expect(screen.getByDisplayValue('09:00')).toBeInTheDocument());

    expect(screen.getByText(/not synced with|does not sync with|separate from/i)).toBeInTheDocument();
    expect(screen.getByText(/meta business (manager|profile)/i)).toBeInTheDocument();
  });
});

describe('Admin Business Settings Page', () => {
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('loads and displays the current settings', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockAdminUser }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockSettings }) });
    });

    render(<BusinessSettingsPage />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('09:00')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('17:00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Welcome!')).toBeInTheDocument();
    expect(screen.getByDisplayValue("We're closed right now.")).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /round robin/i })).toBeChecked();
  });

  it('renders the timezone field as a dropdown of real IANA timezones, not free text', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockAdminUser }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockSettings }) });
    });

    render(<BusinessSettingsPage />)
    await waitFor(() => expect(screen.getByLabelText(/timezone/i)).toBeInTheDocument());

    const select = screen.getByLabelText(/timezone/i);
    expect(select.tagName).toBe('SELECT');
    expect(select).toHaveValue('UTC');
    expect(screen.getByRole('option', { name: 'America/New_York' })).toBeInTheDocument();
  });

  it('preserves a saved timezone that is not one of the runtime-supported option values', async () => {
    // Different ICU/Node builds can expose different canonical aliases for
    // the same zone (e.g. "Asia/Kolkata" vs "Asia/Calcutta") -- a value saved
    // under one alias must not silently disappear from the dropdown just
    // because the current runtime happens to prefer the other one.
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockAdminUser }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { ...mockSettings, timezone: 'Some/Unlisted_Zone' } }) });
    });

    render(<BusinessSettingsPage />)
    await waitFor(() => expect(screen.getByLabelText(/timezone/i)).toBeInTheDocument());

    expect(screen.getByLabelText(/timezone/i)).toHaveValue('Some/Unlisted_Zone');
    expect(screen.getByRole('option', { name: 'Some/Unlisted_Zone' })).toBeInTheDocument();
  });

  it('saves updated settings', async () => {
    global.fetch = jest.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockAdminUser }) });
      }
      if (opts?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { ...mockSettings, first_greeting_message: 'Hey!' } }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockSettings }) });
    });

    render(<BusinessSettingsPage />)
    await waitFor(() => expect(screen.getByDisplayValue('Welcome!')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/first greeting message/i), { target: { value: 'Hey!' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText(/settings saved/i)).toBeInTheDocument();
    });

    const putCall = (global.fetch as jest.Mock).mock.calls.find((c) => c[1]?.method === 'PUT');
    expect(putCall).toBeTruthy();
    const body = JSON.parse(putCall![1].body);
    expect(body.first_greeting_message).toBe('Hey!');
  });

  it('toggling round robin off is reflected in the saved payload', async () => {
    global.fetch = jest.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockAdminUser }) });
      }
      if (opts?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: { ...mockSettings, round_robin_enabled: false } }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockSettings }) });
    });

    render(<BusinessSettingsPage />)
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /round robin/i })).toBeChecked());

    fireEvent.click(screen.getByRole('checkbox', { name: /round robin/i }));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      const putCall = (global.fetch as jest.Mock).mock.calls.find((c) => c[1]?.method === 'PUT');
      expect(putCall).toBeTruthy();
    });
    const putCall = (global.fetch as jest.Mock).mock.calls.find((c) => c[1]?.method === 'PUT');
    const body = JSON.parse(putCall![1].body);
    expect(body.round_robin_enabled).toBe(false);
  });

  it('shows a not-authorized message for non-admin roles', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockAgentUser }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockSettings }) });
    });

    render(<BusinessSettingsPage />)

    await waitFor(() => {
      expect(screen.getByText(/only administrators/i)).toBeInTheDocument();
    });
  });

  it('shows an inline error when saving fails', async () => {
    global.fetch = jest.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockAdminUser }) });
      }
      if (opts?.method === 'PUT') {
        return Promise.resolve({ ok: false, json: async () => ({ message: "'business_hours_start' must be in HH:MM 24-hour format" }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: mockSettings }) });
    });

    render(<BusinessSettingsPage />)
    await waitFor(() => expect(screen.getByDisplayValue('Welcome!')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText(/must be in HH:MM 24-hour format/i)).toBeInTheDocument();
    });
  });
})
