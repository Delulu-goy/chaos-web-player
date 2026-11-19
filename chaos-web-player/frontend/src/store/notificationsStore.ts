// Chaos Radio — Notifications store (Zustand)
//
// Le notifiche non spariscono: `GET /api/notifications` restituisce lo
// storico paginato e il conteggio delle non lette calcolato dal server
// (con la paginazione non può essere derivato dal client).
//
// Il solo fatto di visitare la pagina notifiche le marca come lette:
// `markAllRead()` chiama POST /api/notifications/read-all. Non c'è
// un update ottimistico: lo stato si riallinea al caricamento successivo.

import { create } from "zustand";
import { api } from "../lib/api";
import type { NotificationItem, NotificationsResponse } from "../types/api";

const PAGE_SIZE = 20;

interface NotificationsState {
  items: NotificationItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  unreadCount: number;
  isLoading: boolean;
  error: string | null;

  /** Carica una pagina. `append` concatena (scroll infinito). */
  fetch: (opts?: { page?: number; append?: boolean }) => Promise<void>;
  /** Carica la pagina successiva (se c'è). */
  loadMore: () => Promise<void>;
  /** Marca come lette tutte le notifiche visibili. */
  markAllRead: () => Promise<void>;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  items: [],
  total: 0,
  page: 0,
  limit: PAGE_SIZE,
  hasMore: false,
  unreadCount: 0,
  isLoading: false,
  error: null,

  fetch: async ({ page = 0, append = false } = {}) => {
    // isLoading è impostato anche per le pagine successive: è il guard che
    // impedisce a `loadMore` di caricare due volte la stessa pagina.
    set({ isLoading: true, error: null });
    try {
      const res = await api.get<NotificationsResponse>(
        `/notifications?page=${page}&limit=${PAGE_SIZE}`,
      );
      set((state) => {
        // Refresh della prima pagina (polling): se l'utente ha già
        // caricato pagine successive, si aggiorna solo la prima e si
        // conserva il resto (niente salti di scroll).
        const items = append
          ? [...state.items, ...res.items]
          : state.items.length > res.items.length
            ? [...res.items, ...state.items.slice(res.items.length)]
            : res.items;
        return {
          items,
          total: res.total,
          page: res.page,
          limit: res.limit,
          hasMore: items.length < res.total,
          unreadCount: res.unreadCount,
          isLoading: false,
          error: null,
        };
      });
    } catch {
      set({ error: "Impossibile caricare le notifiche", isLoading: false });
    }
  },

  loadMore: async () => {
    const { page, hasMore, isLoading } = get();
    if (!hasMore || isLoading) return;
    await get().fetch({ page: page + 1, append: true });
  },

  markAllRead: async () => {
    try {
      await api.post("/notifications/read-all");
    } catch {
      // Fallimento silenzioso: non deve disturbare la pagina. Lo stato
      // "letto" si riallinea al prossimo fetch.
    }
  },
}));
