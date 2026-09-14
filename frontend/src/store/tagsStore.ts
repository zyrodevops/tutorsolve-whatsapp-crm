import { create } from 'zustand';
import { API_URL } from '@/lib/config';

const TTL_MS = 30_000;

export interface Tag {
  id: string;
  name: string;
  color_hex: string;
}

interface TagsStore {
  tags: Tag[];
  isLoading: boolean;
  error: string;
  lastFetchedAt: number;
  fetch: () => Promise<void>;
  invalidate: () => void;
  addTag: (tag: Tag) => void;
  removeTag: (id: string) => void;
}

export const useTagsStore = create<TagsStore>((set, get) => ({
  tags: [],
  isLoading: false,
  error: '',
  lastFetchedAt: 0,

  fetch: async () => {
    const { lastFetchedAt, isLoading } = get();
    if (isLoading || (Date.now() - lastFetchedAt < TTL_MS && lastFetchedAt > 0)) return;

    set({ isLoading: true, error: '' });
    try {
      const res = await fetch(`${API_URL}/api/admin/tags`, { credentials: 'include' });
      const payload = await res.json();
      if (res.ok) {
        set({ tags: payload.data, lastFetchedAt: Date.now() });
      } else {
        set({ error: payload.message || 'Failed to load tags.' });
      }
    } catch {
      set({ error: 'An unexpected error occurred.' });
    } finally {
      set({ isLoading: false });
    }
  },

  invalidate: () => set({ lastFetchedAt: 0 }),
  addTag: (tag) => set((s) => ({ tags: [...s.tags, tag] })),
  removeTag: (id) => set((s) => ({ tags: s.tags.filter((t) => t.id !== id) })),
}));
