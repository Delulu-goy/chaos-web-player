// Chaos Radio — Toast store (Zustand)
// Coda di notifiche toast/snackbar mostrate in fondo alla pagina.
// Auto-dismiss dopo `duration` ms (default 4000). Massimo MAX_VISIBLE visibili.

import { create } from "zustand";

export type ToastKind = "success" | "error" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** ms prima dell'auto-dismiss. 0 = persistente (richiede dismiss manuale). */
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  show: (kind: ToastKind, message: string, duration?: number) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

let nextId = 1;
const MAX_VISIBLE = 3;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  show: (kind, message, duration = 4000) => {
    const id = nextId++;
    const toast: Toast = { id, kind, message, duration };

    set((s) => {
      // Se siamo al cap, rimuovi il più vecchio
      const next = s.toasts.length >= MAX_VISIBLE
        ? s.toasts.slice(s.toasts.length - MAX_VISIBLE + 1)
        : s.toasts.slice();
      next.push(toast);
      return { toasts: next };
    });

    // Auto-dismiss
    if (duration > 0 && typeof window !== "undefined") {
      window.setTimeout(() => {
        // Controlla che sia ancora presente (non già dismissato manualmente)
        if (get().toasts.some((t) => t.id === id)) {
          get().dismiss(id);
        }
      }, duration);
    }

    return id;
  },

  dismiss: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  clear: () => set({ toasts: [] }),
}));

/**
 * Helper ergonomico: `toast.error("msg")`, `toast.success("msg")`, `toast.info("msg")`.
 * Usalo senza dover importare lo store direttamente nei componenti.
 */
export const toast = {
  success: (message: string, duration?: number) =>
    useToastStore.getState().show("success", message, duration),
  error: (message: string, duration?: number) =>
    useToastStore.getState().show("error", message, duration),
  info: (message: string, duration?: number) =>
    useToastStore.getState().show("info", message, duration),
  dismiss: (id: number) => useToastStore.getState().dismiss(id),
  clear: () => useToastStore.getState().clear(),
};