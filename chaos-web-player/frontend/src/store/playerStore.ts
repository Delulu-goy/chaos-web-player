// Chaos Radio — Player store (Zustand)
// Stato globale del player: traccia corrente, coda, stato di riproduzione.
// L'<audio> effettivo vive in useAudioEngine e sincronizza qui dentro.
//
// Lo stato viene persistito in localStorage: dopo un reload l'utente
// ritrova lo stesso brano, la stessa coda e riprende da dove era.
// Le scritture sono throttled (vedi lib/throttledStorage) perché `progress`
// viene aggiornato ~4 volte al secondo durante la riproduzione.

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  createThrottledStorage,
  getLocalStorage,
  memoryStorage,
} from "../lib/throttledStorage";
import type { Track } from "../types/api";

const PLAYER_STORAGE_KEY = "chaos-radio-player";
const PERSIST_THROTTLE_MS = 3000;

const localStorage = getLocalStorage();

const playerStorage = createJSONStorage(() =>
  localStorage
    ? createThrottledStorage(localStorage, PERSIST_THROTTLE_MS)
    : memoryStorage,
);

interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;

  isPlaying: boolean;
  isMuted: boolean;
  volume: number; // 0..1
  progress: number; // 0..1 (derivato da audio.currentTime / duration)

  // Actions
  setQueue: (tracks: Track[], startIndex?: number) => void;
  playTrack: (track: Track, queue?: Track[]) => void;
  toggle: () => void;
  setPlaying: (b: boolean) => void;
  next: () => void;
  prev: () => void;
  setProgress: (p: number) => void;
  setMuted: (b: boolean) => void;
  setVolume: (v: number) => void;
  reset: () => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      currentTrack: null,
      queue: [],
      queueIndex: -1,

      isPlaying: false,
      isMuted: false,
      volume: 1,
      progress: 0,

      setQueue: (tracks, startIndex = 0) => {
        if (tracks.length === 0) {
          set({ currentTrack: null, queue: [], queueIndex: -1 });
          return;
        }
        const idx = Math.max(0, Math.min(startIndex, tracks.length - 1));
        set({
          queue: tracks,
          queueIndex: idx,
          currentTrack: tracks[idx],
          progress: 0,
          isPlaying: true,
        });
      },

      playTrack: (track, queue) => {
        const finalQueue = queue ?? [track];
        const idx = finalQueue.findIndex((t) => t.id === track.id);
        set({
          queue: finalQueue,
          queueIndex: idx >= 0 ? idx : 0,
          currentTrack: track,
          progress: 0,
          isPlaying: true,
        });
      },

      // Forma funzionale: legge lo stato più recente senza passare per get(),
      // che può essere stale se più azioni sono accodate nello stesso tick.
      toggle: () => set((s) => ({ isPlaying: !s.isPlaying })),

      setPlaying: (b) => set({ isPlaying: b }),

      next: () =>
        set((s) => {
          if (s.queueIndex >= s.queue.length - 1) return s; // fine coda: no-op
          const nextIdx = s.queueIndex + 1;
          return {
            queueIndex: nextIdx,
            currentTrack: s.queue[nextIdx],
            progress: 0,
            isPlaying: true,
          };
        }),

      prev: () =>
        set((s) => {
          if (s.queueIndex <= 0) return s; // inizio coda: no-op
          const prevIdx = s.queueIndex - 1;
          return {
            queueIndex: prevIdx,
            currentTrack: s.queue[prevIdx],
            progress: 0,
            isPlaying: true,
          };
        }),

      setProgress: (p) => set({ progress: Math.min(1, Math.max(0, p)) }),

      setMuted: (b) => set({ isMuted: b }),

      setVolume: (v) => set({ volume: Math.min(1, Math.max(0, v)) }),

      reset: () =>
        set({
          currentTrack: null,
          queue: [],
          queueIndex: -1,
          isPlaying: false,
          progress: 0,
        }),
    }),
    {
      name: PLAYER_STORAGE_KEY,
      // Se in futuro la forma dello stato persistito cambia, bumpare la
      // versione: Zustand scarta lo stato salvato invece di corromperlo.
      version: 1,
      storage: playerStorage,
      partialize: (state) => ({
        queue: state.queue,
        queueIndex: state.queueIndex,
        currentTrack: state.currentTrack,
        progress: state.progress,
        isMuted: state.isMuted,
        volume: state.volume,
        // `isPlaying` NON viene persistito: dopo un reload l'autoplay policy
        // dei browser bloccherebbe comunque il play automatico, e riprendere
        // a suonare senza interazione sarebbe surprising. Il brano resta
        // caricato ma in pausa.
        isPlaying: false,
      }),
    },
  ),
);
