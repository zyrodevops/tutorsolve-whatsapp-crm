import { create } from 'zustand';
import { API_URL } from '@/lib/config';

const TTL_MS = 30_000;

export interface BusinessSettings {
  business_hours_start: string | null;
  business_hours_end: string | null;
  timezone: string;
  out_of_office_message: string | null;
  first_greeting_message: string | null;
  round_robin_enabled: boolean;
}

interface SettingsStore {
  settings: BusinessSettings | null;
  isLoading: boolean;
  error: string;
  lastFetchedAt: number;
  fetch: () => Promise<void>;
  updateSettings: (updated: BusinessSettings) => void;
  invalidate: () => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: null,
  isLoading: false,
  error: '',
  lastFetchedAt: 0,

  fetch: async () => {
    const { lastFetchedAt, isLoading } = get();
    if (isLoading || (Date.now() - lastFetchedAt < TTL_MS && lastFetchedAt > 0)) return;

    set({ isLoading: true, error: '' });
    try {
      const res = await fetch(`${API_URL}/api/admin/business-settings`, { credentials: 'include' });
      const payload = await res.json();
      if (res.ok) {
        set({ settings: payload.data, lastFetchedAt: Date.now() });
      } else {
        set({ error: payload.message || 'Failed to load settings.' });
      }
    } catch {
      set({ error: 'An unexpected error occurred.' });
    } finally {
      set({ isLoading: false });
    }
  },

  updateSettings: (updated) => set({ settings: updated, lastFetchedAt: Date.now() }),
  invalidate: () => set({ lastFetchedAt: 0 }),
}));
