import { create } from 'zustand';

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

interface ToastState {
  toasts: Toast[];
  /** Shows a toast for `ms` (default 5 s). Returns its id. */
  show: (text: string, action?: Toast['action'], ms?: number) => number;
  dismiss: (id: number) => void;
}

let next = 1;

/** Transient messages at the bottom of the screen, e.g. "Pasted link → Link card · Undo ⌘Z". */
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  show: (text, action, ms = 5000) => {
    const id = next++;
    set({ toasts: [...get().toasts.slice(-2), { id, text, action }] });
    setTimeout(() => get().dismiss(id), ms);
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (text: string, action?: Toast['action'], ms?: number) => useToasts.getState().show(text, action, ms);
