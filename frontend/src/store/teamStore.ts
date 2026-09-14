import { create } from 'zustand';
import { API_URL } from '@/lib/config';

const TTL_MS = 30_000; // 30 seconds

interface User {
  id: string;
  full_name: string;
  email: string;
  role: string;
  system_status: string;
  created_at: string;
  is_current_user: boolean;
}

interface TeamStore {
  users: User[];
  isLoading: boolean;
  error: string;
  lastFetchedAt: number;
  fetch: () => Promise<void>;
  invalidate: () => void;
  setUsers: (updater: (prev: User[]) => User[]) => void;
}

export const useTeamStore = create<TeamStore>((set, get) => ({
  users: [],
  isLoading: false,
  error: '',
  lastFetchedAt: 0,

  fetch: async () => {
    const { lastFetchedAt, isLoading } = get();
    // Skip fetch if data is fresh or already loading
    if (isLoading || (Date.now() - lastFetchedAt < TTL_MS && lastFetchedAt > 0)) return;

    set({ isLoading: true, error: '' });
    try {
      const res = await fetch(`${API_URL}/api/users`, { credentials: 'include' });
      const payload = await res.json();
      if (res.ok) {
        set({ users: payload.data, lastFetchedAt: Date.now() });
      } else {
        set({ error: payload.message || 'Failed to load team members.' });
      }
    } catch {
      set({ error: 'Failed to load team members.' });
    } finally {
      set({ isLoading: false });
    }
  },

  invalidate: () => set({ lastFetchedAt: 0 }),

  setUsers: (updater) => set((state) => ({ users: updater(state.users) })),
}));
