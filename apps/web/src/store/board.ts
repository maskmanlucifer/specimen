import { create } from 'zustand';
import { cardText, uid, type Board, type Card, type CardType, type Link, type LogAction, type Section, type StorageInfo, type SyncState } from '@specimen/schema';
import { api, ApiError } from '../lib/api';
import { offline } from '../lib/offline';

const SAVE_DELAY = 800;
const HISTORY = 100;

/** Card input without the fields the store fills in. */
export type NewCard = { [K in CardType]: Omit<Extract<Card, { type: K }>, 'id' | 'createdAt' | 'updatedAt' | 'tags' | 'private' | 'sectionId' | 'w'> & Partial<Pick<Card, 'tags' | 'private' | 'sectionId' | 'w'>> }[CardType];

export interface EditorState {
  storageId: string;
  slug: string;
  board: Board | null;
  storage: StorageInfo | null;
  /** Revision the local board is based on. */
  baseRev: number;
  loadError: string | null;
  selection: string[];
  past: Board[];
  future: Board[];
  sync: SyncState;
  /** Edits not yet confirmed by the server. */
  unsynced: number;
  lastSynced: number | null;
  /** The newer server board when a save hit a revision conflict. */
  conflict: Board | null;

  /**
   * Loads a board. Reloading the board that is already open (after a publish, for example)
   * keeps it on screen until the new copy arrives, so open dialogs are not unmounted.
   * Unsynced local edits from IndexedDB win over the server copy and are saved at once.
   */
  load: (sid: string, slug: string) => Promise<void>;
  /**
   * Applies a change. `log` adds a research-log entry; `history: false` skips undo (used while dragging).
   */
  change: (fn: (b: Board) => void, opts?: { log?: { action: LogAction; cardId?: string; text: string }; history?: boolean }) => void;
  undo: () => void;
  redo: () => void;
  /**
   * Sets the selected ids. The same ids keep the same array: a new array re-syncs the
   * canvas, which reports the selection again, in an endless loop that freezes the page.
   */
  select: (ids: string[]) => void;
  addCard: (card: NewCard, at: { x: number; y: number }) => Card;
  updateCard: (id: string, patch: Partial<Card>, logText?: string) => void;
  addSection: (at: { x: number; y: number }, title?: string) => Section;
  updateSection: (id: string, patch: Partial<Section>) => void;
  addLink: (from: string, to: string, label?: string) => void;
  updateLink: (id: string, patch: Partial<Link>) => void;
  removeIds: (ids: string[]) => void;
  /** Recomputes which section each card sits in (by its centre point). */
  assignSections: (ids?: string[]) => void;
  /**
   * Saves now. Saves never run in parallel: a call waits for the save in flight, then saves
   * the current board. A caller that awaits it therefore knows its latest edits reached the
   * server, or that the failure is visible in {@link EditorState.sync}.
   */
  flush: () => Promise<void>;
  resolveConflict: (merged: Board) => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** The save in flight. Saves never overlap: two PUTs with the same base revision would conflict with each other. */
let inflight: Promise<void> | null = null;

/** Estimated card height before the canvas has measured it. */
const EST_H = 120;

/** Card heights measured by the canvas, so placement knows how tall cards really are. */
const measured = new Map<string, number>();

/** Called by the canvas whenever it measures cards. */
export function setMeasuredHeights(h: Map<string, number>) {
  measured.clear();
  for (const [k, v] of h) measured.set(k, v);
}

/**
 * Nearest free spot for a new card: tries the requested point, then rings of positions around it,
 * so new cards never land on top of existing ones.
 */
function freeSpot(b: Board, at: { x: number; y: number }, w: number): { x: number; y: number } {
  const hits = (x: number, y: number) => b.cards.some((c) => x < c.x + c.w + 12 && x + w + 12 > c.x && y < c.y + (measured.get(c.id) ?? c.h ?? EST_H) + 12 && y + EST_H + 12 > c.y);
  if (!hits(at.x, at.y)) return at;
  for (let r = 1; r <= 12; r++)
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = at.x + dx * r * 60;
      const y = at.y + dy * r * 60;
      if (!hits(x, y)) return { x, y };
    }
  return at;
}

const sectionAt = (b: Board, c: { x: number; y: number; w: number; h?: number }) => {
  const cx = c.x + c.w / 2;
  const cy = c.y + (c.h ?? 80) / 2;
  return b.sections.find((s) => cx >= s.x && cx <= s.x + s.w && cy >= s.y && cy <= s.y + s.h)?.id ?? null;
};

/**
 * The open board. Every edit goes: local state → IndexedDB copy → debounced PUT with `baseRev`.
 * A 409 stops autosave and shows the conflict chooser; a network error marks the board offline
 * and retries when the browser comes back online.
 */
export const useBoard = create<EditorState>((set, get) => {
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => get().flush(), SAVE_DELAY);
  };

  /** One save of the current board against `baseRev`. Called only through `flush`, never in parallel. */
  const saveOnce = async () => {
    const { board, storageId, slug, baseRev, unsynced } = get();
    if (!board || !unsynced || get().sync === 'conflict') return;
    set({ sync: 'saving' });
    try {
      const { board: saved } = await api.saveBoard(storageId, slug, board, baseRev);
      // Edits made while the request was in flight stay unsynced and trigger another save.
      const stillDirty = get().board !== board;
      set({ baseRev: saved.rev, lastSynced: Date.now(), unsynced: stillDirty ? get().unsynced - unsynced : 0, sync: stillDirty ? 'saving' : 'saved' });
      if (!stillDirty) set({ board: { ...board, rev: saved.rev } });
      if (stillDirty) scheduleSave();
      else await offline.clear(storageId, slug);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409) set({ sync: 'conflict', conflict: err.body.current as Board });
      else if (err.reconnect) set({ sync: 'reconnect' });
      else if (err.offline) set({ sync: 'offline' });
      else set({ sync: 'error' });
    }
  };

  window.addEventListener('online', () => {
    if (get().unsynced) get().flush();
  });

  return {
    storageId: '',
    slug: '',
    board: null,
    storage: null,
    baseRev: 0,
    loadError: null,
    selection: [],
    past: [],
    future: [],
    sync: 'saved',
    unsynced: 0,
    lastSynced: null,
    conflict: null,

    load: async (sid, slug) => {
      clearTimeout(saveTimer);
      const same = get().storageId === sid && get().slug === slug && !!get().board;
      if (!same) set({ storageId: sid, slug, board: null, loadError: null, selection: [], past: [], future: [], conflict: null, unsynced: 0, sync: 'saved' });
      const pending = await offline.get(sid, slug);
      try {
        const { board, storage } = await api.board(sid, slug);
        if (pending && pending.changes > 0) {
          // Local edits survived a reload or a closed tab: keep them and sync now.
          set({ board: pending.board, storage, baseRev: pending.baseRev, unsynced: pending.changes, sync: 'saving' });
          await get().flush();
        } else {
          set({ board, storage, baseRev: board.rev, lastSynced: Date.now() });
        }
      } catch (e) {
        const err = e as ApiError;
        if (pending) {
          set({ board: pending.board, baseRev: pending.baseRev, unsynced: pending.changes, sync: err.reconnect ? 'reconnect' : 'offline' });
        } else {
          set({ loadError: err.message, sync: err.reconnect ? 'reconnect' : err.offline ? 'offline' : 'error' });
        }
      }
    },

    change: (fn, opts = {}) => {
      const prev = get().board;
      if (!prev) return;
      const next = structuredClone(prev);
      fn(next);
      next.updatedAt = Date.now();
      if (opts.log) next.log = [...next.log, { id: uid('e_'), at: Date.now(), ...opts.log, cardType: next.cards.find((c) => c.id === opts.log!.cardId)?.type, sectionId: next.cards.find((c) => c.id === opts.log!.cardId)?.sectionId ?? undefined }].slice(-2000);
      set((s) => ({
        board: next,
        past: opts.history === false ? s.past : [...s.past, prev].slice(-HISTORY),
        future: opts.history === false ? s.future : [],
        unsynced: s.unsynced + 1,
        sync: s.sync === 'conflict' || s.sync === 'reconnect' ? s.sync : 'saving',
      }));
      offline.put({ storageId: get().storageId, board: next, baseRev: get().baseRev, changes: get().unsynced, savedAt: Date.now() });
      if (get().sync !== 'conflict') scheduleSave();
    },

    undo: () => {
      const { past, board } = get();
      if (!past.length || !board) return;
      set({ board: past[past.length - 1], past: past.slice(0, -1), future: [board, ...get().future], unsynced: get().unsynced + 1, sync: 'saving' });
      scheduleSave();
    },
    redo: () => {
      const { future, board } = get();
      if (!future.length || !board) return;
      set({ board: future[0], future: future.slice(1), past: [...get().past, board], unsynced: get().unsynced + 1, sync: 'saving' });
      scheduleSave();
    },

    select: (ids) => {
      const cur = get().selection;
      if (cur.length !== ids.length || cur.some((id, i) => id !== ids[i])) set({ selection: ids });
    },

    addCard: (input, at) => {
      const now = Date.now();
      const w = input.w ?? 240;
      const spot = freeSpot(get().board!, at, w);
      const card = { tags: [], private: false, w, sectionId: null, ...input, id: uid('c_'), x: Math.round(spot.x), y: Math.round(spot.y), createdAt: now, updatedAt: now } as Card;
      get().change(
        (b) => {
          card.sectionId = input.sectionId ?? sectionAt(b, card);
          b.cards.push(card);
        },
        { log: { action: 'added', cardId: card.id, text: cardText(card).slice(0, 140) || `Added ${card.type} card` } },
      );
      set({ selection: [card.id] });
      return card;
    },

    updateCard: (id, patch, logText) =>
      get().change(
        (b) => {
          const i = b.cards.findIndex((c) => c.id === id);
          if (i >= 0) b.cards[i] = { ...b.cards[i], ...patch, updatedAt: Date.now() } as Card;
        },
        logText ? { log: { action: 'edited', cardId: id, text: logText } } : {},
      ),

    addSection: (at, title) => {
      const b = get().board!;
      const s: Section = { id: uid('s_'), title: title ?? `Section ${b.sections.length + 1}`, x: Math.round(at.x), y: Math.round(at.y), w: 440, h: 320 };
      get().change((d) => {
        d.sections.push(s);
        d.trail.push(s.id);
      });
      set({ selection: [s.id] });
      return s;
    },

    updateSection: (id, patch) =>
      get().change((b) => {
        const i = b.sections.findIndex((s) => s.id === id);
        if (i >= 0) b.sections[i] = { ...b.sections[i], ...patch };
      }),

    addLink: (from, to, label) => {
      if (from === to) return;
      get().change(
        (b) => {
          if (!b.links.some((l) => l.from === from && l.to === to)) b.links.push({ id: uid('l_'), from, to, label });
        },
        { log: { action: 'linked', cardId: from, text: `Connected ${label ? `“${label}”` : 'two cards'}` } },
      );
    },

    updateLink: (id, patch) =>
      get().change((b) => {
        const i = b.links.findIndex((l) => l.id === id);
        if (i >= 0) b.links[i] = { ...b.links[i], ...patch };
      }),

    removeIds: (ids) => {
      if (!ids.length) return;
      const set_ = new Set(ids);
      const b = get().board!;
      const removedCards = b.cards.filter((c) => set_.has(c.id));
      get().change(
        (d) => {
          d.cards = d.cards.filter((c) => !set_.has(c.id));
          // Removing a section keeps its cards on the canvas, just outside any section.
          for (const c of d.cards) if (c.sectionId && set_.has(c.sectionId)) c.sectionId = null;
          d.sections = d.sections.filter((s) => !set_.has(s.id));
          d.trail = d.trail.filter((id) => !set_.has(id));
          d.links = d.links.filter((l) => !set_.has(l.id) && !set_.has(l.from) && !set_.has(l.to));
          for (const c of d.cards) if (c.type === 'figure') for (const [k, v] of Object.entries(c.inputs)) if (set_.has(v)) delete c.inputs[k];
        },
        removedCards.length ? { log: { action: 'deleted', text: removedCards.length === 1 ? `Deleted ${removedCards[0].type}: ${cardText(removedCards[0]).slice(0, 80)}` : `Deleted ${removedCards.length} cards` } } : {},
      );
      set({ selection: [] });
    },

    assignSections: (ids) =>
      get().change(
        (b) => {
          for (const c of b.cards) if (!ids || ids.includes(c.id)) c.sectionId = sectionAt(b, c);
        },
        { history: false },
      ),

    flush: async () => {
      clearTimeout(saveTimer);
      while (inflight) await inflight;
      inflight = saveOnce().finally(() => (inflight = null));
      await inflight;
    },
    resolveConflict: async (merged) => {
      const { storageId, conflict } = get();
      set({ board: merged, conflict: null, sync: 'saving', baseRev: conflict?.rev ?? get().baseRev, unsynced: get().unsynced + 1 });
      await offline.put({ storageId, board: merged, baseRev: get().baseRev, changes: get().unsynced, savedAt: Date.now() });
      await get().flush();
    },
  };
});

/** Card lookup that re-renders only when that card changes. */
export const useCard = (id: string) => useBoard((s) => s.board?.cards.find((c) => c.id === id));
