// Chaos Radio — Favorites store (Zustand)
//
// Unica fonte di verità sullo stato "preferito" dell'utente: i cuori in
// tutta l'app (player, playlist, preferiti, pirate day) leggono e scrivono
// qui, nessun componente duplica lo stato.
//
// `items` = lista completa dei preferiti (dal server), usata da FavoritesPage
// per il rendering. `favoriteIds` = gli ID, per lookup O(1) nei selettori
// dei singoli cuori.

import { create } from "zustand";
import { api, ApiError } from "../lib/api";
import { toast } from "./toastStore";
import type { Track } from "../types/api";

interface FavoritesState {
  /** Brani preferiti dell'utente corrente (dal server). */
  items: Track[];
  /** ID dei preferiti, per lookup O(1). */
  favoriteIds: Set<number>;
  isLoading: boolean;
  error: string | null;

  fetch: () => Promise<void>;
  isFavorite: (trackId: number) => boolean;
  toggle: (track: Track) => Promise<boolean>;
  reset: () => void;
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  items: [],
  favoriteIds: new Set(),
  isLoading: false,
  error: null,

  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const tracks = await api.get<Track[]>("/favorites");
      set({
        items: tracks,
        favoriteIds: new Set(tracks.map((t) => t.id)),
        isLoading: false,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Non loggato: reset silenzioso
        set({ items: [], favoriteIds: new Set(), isLoading: false });
        return;
      }
      set({ error: "Impossibile caricare i preferiti", isLoading: false });
    }
  },

  isFavorite: (trackId) => get().favoriteIds.has(trackId),

  toggle: async (track) => {
    const wasFavorite = get().favoriteIds.has(track.id);
    const next = !wasFavorite;

    // Snapshot PRIMA dell'ottimistica: è ciò che va ripristinato se la
    // chiamata fallisce. (Prima si leggeva lo stato DOPO l'ottimistica:
    // il rollback era un no-op e l'errore restava invisibile.)
    const previousIds = get().favoriteIds;
    const previousItems = get().items;

    const optimisticIds = new Set(previousIds);
    if (next) {
      optimisticIds.add(track.id);
    } else {
      optimisticIds.delete(track.id);
    }

    // La lista dei preferiti si aggiorna subito: il nuovo preferito entra
    // in testa, quello tolto esce. Così FavoritesPage si aggiorna in tempo
    // reale senza refetch.
    const optimisticItems = next
      ? [track, ...previousItems.filter((t) => t.id !== track.id)]
      : previousItems.filter((t) => t.id !== track.id);

    set({ favoriteIds: optimisticIds, items: optimisticItems });

    try {
      if (next) {
        await api.post(`/favorites/${track.id}`);
      } else {
        await api.delete(`/favorites/${track.id}`);
      }
      return next;
    } catch (err) {
      // Rollback: ripristiniamo lo stato precedente, non quello ottimistico.
      set({ favoriteIds: previousIds, items: previousItems });
      if (err instanceof ApiError) {
        console.warn(`Favorite[${track.id}] toggle failed:`, err.code);
        if (err.status === 403) {
          // I brani del Pirate Day non sono preferitabili: l'API risponde
          // 403 (invariante I3). Toast dedicato invece di quello generico.
          toast.error(
            "I brani del Pirate Day non si possono salvare nei preferiti.",
          );
        } else {
          toast.error("Impossibile aggiornare i preferiti. Riprova.");
        }
      } else {
        toast.error("Impossibile aggiornare i preferiti. Riprova.");
      }
      throw err;
    }
  },

  reset: () => set({ items: [], favoriteIds: new Set(), error: null }),
}));
