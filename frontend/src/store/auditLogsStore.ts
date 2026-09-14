import { create } from 'zustand';
import { API_URL } from '@/lib/config';

// Audit logs are time-sensitive; use a shorter TTL
const TTL_MS = 15_000;

export interface AuditLogEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  ip_address: string;
  timestamp: string;
  user: { full_name: string; email: string | null };
}

interface AuditLogsStore {
  entries: AuditLogEntry[];
  isLoading: boolean;
  error: string;
  lastFetchedAt: number;
  fetch: () => Promise<void>;
  invalidate: () => void;
}

export const useAuditLogsStore = create<AuditLogsStore>((set, get) => ({
  entries: [],
  isLoading: false,
  error: '',
  lastFetchedAt: 0,

  fetch: async () => {
    const { lastFetchedAt, isLoading } = get();
    if (isLoading || (Date.now() - lastFetchedAt < TTL_MS && lastFetchedAt > 0)) return;

    set({ isLoading: true, error: '' });
    try {
      const res = await fetch(`${API_URL}/api/admin/audit-logs`, { credentials: 'include' });
      const payload = await res.json();
      if (res.ok) {
        set({ entries: payload.data, lastFetchedAt: Date.now() });
      } else {
        set({ error: payload.message || 'Failed to load audit logs.' });
      }
    } catch {
      set({ error: 'An unexpected error occurred.' });
    } finally {
      set({ isLoading: false });
    }
  },

  invalidate: () => set({ lastFetchedAt: 0 }),
}));
