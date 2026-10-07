// Chaos Radio — Favorites store (Zustand)
// Tiene in cache gli ID dei brani preferiti dell'utente corrente per mostrare
// lo stato "liked" nelle liste senza dover interrogare /api/favorites ogni volta.

import { create } from "zustand";
import { api, ApiError } from "../lib/api";
import type { Track } from "../types/api";

interface FavoritesState {
  favoriteIds: Set<number>;
  isLoading: boolean;
  error: string | null;

  fetch: () => Promise<void>;
  isFavorite: (trackId: number) => boolean;
  toggle: (trackId: number) => Promise<boolean>;
  reset: () => void;
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favoriteIds: new Set(),
  isLoading: false,
  error: null,

  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const tracks = await api.get<Track[]>("/favorites");
      set({
        favoriteIds: new Set(tracks.map((t) => t.id)),
        isLoading: false,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Non loggato: reset silenzioso
        set({ favoriteIds: new Set(), isLoading: false });
        return;
      }
      set({ error: "Impossibile caricare i preferiti", isLoading: false });
    }
  },

  isFavorite: (trackId) => get().favoriteIds.has(trackId),

  toggle: async (trackId) => {
    const isFav = get().favoriteIds.has(trackId);
    const next = !isFav;

    // Optimistic update
    const newSet = new Set(get().favoriteIds);
    if (next) {
      newSet.add(trackId);
    } else {
      newSet.delete(trackId);
    }
    set({ favoriteIds: newSet });

    try {
      if (next) {
        await api.post(`/favorites/${trackId}`);
      } else {
        await api.delete(`/favorites/${trackId}`);
      }
      return next;
    } catch (err) {
      // Rollback
      const rollback = new Set(get().favoriteIds);
      if (isFav) {
        rollback.add(trackId);
      } else {
        rollback.delete(trackId);
      }
      set({ favoriteIds: rollback });
      if (err instanceof ApiError) {
        console.warn(`Favorite[${trackId}] toggle failed:`, err.code);
      }
      throw err;
    }
  },

  reset: () => set({ favoriteIds: new Set(), error: null }),
}));