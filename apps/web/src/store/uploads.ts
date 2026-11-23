import { create } from 'zustand';
import { uid } from '@specimen/schema';
import { api } from '../lib/api';

/** Upload part size. Matches the server and the design copy ("8 MB chunks"). */
export const CHUNK = 8 * 1024 * 1024;

export interface Upload {
  id: string;
  name: string;
  size: number;
  received: number;
  status: 'uploading' | 'paused' | 'done' | 'error';
  error?: string;
  /** Card type it becomes, for the ghost card on the canvas. */
  kind: string;
  at: { x: number; y: number };
  startedAt: number;
  /** Board-relative path once done. */
  src?: string;
}

interface UploadsState {
  uploads: Upload[];
  start: (sid: string, slug: string, file: File, kind: string, at: { x: number; y: number }) => Promise<{ src: string; size: number }>;
  cancel: (id: string) => void;
  clearDone: () => void;
}

const cancelled = new Set<string>();

const waitOnline = () => new Promise<void>((r) => (navigator.onLine ? r() : window.addEventListener('online', () => r(), { once: true })));

/**
 * Chunked uploads straight into the board's storage folder. Going offline pauses an upload;
 * it resumes from the server's received byte count when the connection returns.
 */
export const useUploads = create<UploadsState>((set, get) => {
  const patch = (id: string, p: Partial<Upload>) => set({ uploads: get().uploads.map((u) => (u.id === id ? { ...u, ...p } : u)) });

  return {
    uploads: [],
    start: async (sid, slug, file, kind, at) => {
      const id = uid('up_');
      set({ uploads: [...get().uploads, { id, name: file.name, size: file.size, received: 0, status: 'uploading', kind, at, startedAt: Date.now() }] });
      let offset = 0;
      for (;;) {
        if (cancelled.has(id)) throw new Error('Upload cancelled');
        try {
          await waitOnline();
          patch(id, { status: 'uploading' });
          const part = file.slice(offset, offset + CHUNK);
          const res = await api.uploadPart(sid, slug, { id, name: file.name, offset, total: file.size }, part, file.type || 'application/octet-stream');
          offset = res.received;
          patch(id, { received: offset });
          if (res.src) {
            patch(id, { status: 'done', src: res.src });
            setTimeout(() => set({ uploads: get().uploads.filter((u) => u.id !== id) }), 4000);
            return { src: res.src, size: res.size ?? file.size };
          }
        } catch (e) {
          const offline = (e as { offline?: boolean }).offline;
          if (!offline) {
            patch(id, { status: 'error', error: (e as Error).message });
            throw e;
          }
          patch(id, { status: 'paused' });
          await waitOnline();
          // Ask how far the server got before the drop, then continue from there.
          offset = (await api.uploadStatus(sid, slug, id).catch(() => ({ received: offset }))).received;
        }
      }
    },
    cancel: (id) => {
      cancelled.add(id);
      set({ uploads: get().uploads.filter((u) => u.id !== id) });
    },
    clearDone: () => set({ uploads: get().uploads.filter((u) => u.status !== 'done') }),
  };
});
