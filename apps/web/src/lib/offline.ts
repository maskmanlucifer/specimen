import { createStore, del, get, keys, set } from 'idb-keyval';
import type { Board } from '@specimen/schema';

/**
 * Local copy of unsynced board edits, in IndexedDB. Edits are written here first, then
 * uploaded; if the storage is offline or needs reconnecting, work is never lost and syncs later.
 */
export interface PendingBoard {
  storageId: string;
  board: Board;
  /** Revision the local edits are based on; the server rejects the save if it moved on. */
  baseRev: number;
  /** Number of edits made since the last successful sync. */
  changes: number;
  savedAt: number;
}

const store = createStore('specimen', 'pending');
const key = (sid: string, slug: string) => `${sid}/${slug}`;

/** Wraps IndexedDB so a blocked or unavailable database (private mode) degrades to no local copy. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export const offline = {
  put: (p: PendingBoard) => safe(() => set(key(p.storageId, p.board.slug), p, store), undefined),
  get: (sid: string, slug: string) => safe(() => get<PendingBoard>(key(sid, slug), store), undefined),
  clear: (sid: string, slug: string) => safe(() => del(key(sid, slug), store), undefined),
  /** All pending boards, for the dashboard's "Offline · 3 changes queued". */
  all: () =>
    safe(async () => {
      const ks = (await keys(store)) as string[];
      return (await Promise.all(ks.map((k) => get<PendingBoard>(k, store)))).filter((p): p is PendingBoard => !!p);
    }, [] as PendingBoard[]),
};
