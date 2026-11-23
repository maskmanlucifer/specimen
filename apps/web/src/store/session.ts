import { create } from 'zustand';
import type { Session } from '@specimen/schema';
import { api } from '../lib/api';

interface SessionState {
  session: Session | null;
  error: string | null;
  load: () => Promise<Session | null>;
}

/** The signed-in user and instance info. Loaded once at start and after sign-in/out. */
export const useSession = create<SessionState>((set) => ({
  session: null,
  error: null,
  load: async () => {
    try {
      const session = await api.session();
      set({ session, error: null });
      return session;
    } catch (e) {
      set({ error: (e as Error).message });
      return null;
    }
  },
}));
