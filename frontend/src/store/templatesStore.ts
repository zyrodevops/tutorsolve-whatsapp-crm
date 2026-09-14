import { create } from 'zustand';
import { API_URL } from '@/lib/config';

const TTL_MS = 30_000;

export interface MetaTemplate {
  id: string;
  template_name: string;
  meta_template_id: string;
  language_code: string;
  status: string;
  body: string;
}

interface TemplatesStore {
  templates: MetaTemplate[];
  isLoading: boolean;
  error: string;
  lastFetchedAt: number;
  fetch: () => Promise<void>;
  invalidate: () => void;
  syncTemplates: () => Promise<void>;
  removeTemplate: (id: string) => void;
}

export const useTemplatesStore = create<TemplatesStore>((set, get) => ({
  templates: [],
  isLoading: false,
  error: '',
  lastFetchedAt: 0,

  fetch: async () => {
    const { lastFetchedAt, isLoading } = get();
    if (isLoading || (Date.now() - lastFetchedAt < TTL_MS && lastFetchedAt > 0)) return;

    set({ isLoading: true, error: '' });
    try {
      const res = await fetch(`${API_URL}/api/admin/meta-templates`, { credentials: 'include' });
      const payload = await res.json();
      if (res.ok) {
        set({ templates: payload.data, lastFetchedAt: Date.now() });
      } else {
        set({ error: payload.message || 'Failed to load templates.' });
      }
    } catch {
      set({ error: 'An unexpected error occurred.' });
    } finally {
      set({ isLoading: false });
    }
  },

  invalidate: () => set({ lastFetchedAt: 0 }),
  syncTemplates: async () => {
    set({ isLoading: true, error: '' });
    try {
      const res = await fetch(`${API_URL}/api/admin/meta-templates/sync`, {
        method: 'POST',
        credentials: 'include'
      });
      const payload = await res.json();
      if (res.ok) {
        // Clear lastFetchedAt to force a fresh fetch
        set({ lastFetchedAt: 0 });
        await get().fetch();
      } else {
        set({ error: payload.message || 'Failed to sync templates.', isLoading: false });
      }
    } catch {
      set({ error: 'An unexpected error occurred during sync.', isLoading: false });
    }
  },
  removeTemplate: (id) => set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),
}));
