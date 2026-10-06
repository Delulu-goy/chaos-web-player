// Chaos Radio — Notifications store (Zustand)

import { create } from "zustand";
import { api } from "../lib/api";
import type { NotificationItem } from "../types/api";

interface NotificationsState {
  items: NotificationItem[];
  isLoading: boolean;
  error: string | null;

  fetch: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  unreadCount: () => number;
}

export const useNotificationsStore = create<NotificationsState>(
  (set, get) => ({
    items: [],
    isLoading: false,
    error: null,

    fetch: async () => {
      set({ isLoading: true, error: null });
      try {
        const items = await api.get<NotificationItem[]>("/notifications");
        set({ items, isLoading: false });
      } catch {
        set({ error: "Impossibile caricare le notifiche", isLoading: false });
      }
    },

    markRead: async (id) => {
      // Optimistic update
      set({
        items: get().items.map((n) =>
          n.id === id ? { ...n, read: true } : n,
        ),
      });
      try {
        await api.post(`/notifications/${id}/read`);
      } catch {
        // Rollback in caso di errore
        set({
          items: get().items.map((n) =>
            n.id === id ? { ...n, read: false } : n,
          ),
        });
      }
    },

    unreadCount: () => get().items.filter((n) => !n.read).length,
  }),
);