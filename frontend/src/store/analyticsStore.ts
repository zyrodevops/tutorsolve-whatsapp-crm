import { create } from 'zustand';
import { API_URL } from '@/lib/config';

const TTL_MS = 30_000;

interface AnalyticsData {
  total_agents: number;
  online_agents: number;
  total_conversations: number;
  open_conversations: number;
  resolved_conversations: number;
  avg_response_time_seconds: number | null;
}

interface AnalyticsStore {
  data: AnalyticsData | null;
  isLoading: boolean;
  error: string;
  lastFetchedAt: number;
  fetch: () => Promise<void>;
  invalidate: () => void;
}

export const useAnalyticsStore = create<AnalyticsStore>((set, get) => ({
  data: null,
  isLoading: false,
  error: '',
  lastFetchedAt: 0,

  fetch: async () => {
    const { lastFetchedAt, isLoading } = get();
    if (isLoading || (Date.now() - lastFetchedAt < TTL_MS && lastFetchedAt > 0)) return;

    set({ isLoading: true, error: '' });
    try {
      const res = await fetch(`${API_URL}/api/admin/analytics`, { credentials: 'include' });
      const payload = await res.json();
      if (res.ok) {
        set({ data: payload.data, lastFetchedAt: Date.now() });
      } else {
        set({ error: payload.message || 'Failed to load analytics.' });
      }
    } catch {
      set({ error: 'An unexpected error occurred.' });
    } finally {
      set({ isLoading: false });
    }
  },

  invalidate: () => set({ lastFetchedAt: 0 }),
}));
