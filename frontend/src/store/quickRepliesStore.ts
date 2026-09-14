import { create } from 'zustand';
import { API_URL } from '@/lib/config';

const TTL_MS = 30_000;

export interface QuickReply {
  id: string;
  shortcut: string;
  message: string;
  created_at: string;
}

interface QuickRepliesStore {
  replies: QuickReply[];
  isLoading: boolean;
  error: string;
  lastFetchedAt: number;
  fetch: () => Promise<void>;
  invalidate: () => void;
  addReply: (reply: QuickReply) => void;
  removeReply: (id: string) => void;
}

export const useQuickRepliesStore = create<QuickRepliesStore>((set, get) => ({
  replies: [],
  isLoading: false,
  error: '',
  lastFetchedAt: 0,

  fetch: async () => {
    const { lastFetchedAt, isLoading } = get();
    if (isLoading || (Date.now() - lastFetchedAt < TTL_MS && lastFetchedAt > 0)) return;

    set({ isLoading: true, error: '' });
    try {
      const res = await fetch(`${API_URL}/api/admin/quick-replies`, { credentials: 'include' });
      const payload = await res.json();
      if (res.ok) {
        set({ replies: payload.data, lastFetchedAt: Date.now() });
      } else {
        set({ error: payload.message || 'Failed to load quick replies.' });
      }
    } catch {
      set({ error: 'An unexpected error occurred.' });
    } finally {
      set({ isLoading: false });
    }
  },

  invalidate: () => set({ lastFetchedAt: 0 }),
  addReply: (reply) => set((s) => ({ replies: [...s.replies, reply] })),
  removeReply: (id) => set((s) => ({ replies: s.replies.filter((r) => r.id !== id) })),
}));
