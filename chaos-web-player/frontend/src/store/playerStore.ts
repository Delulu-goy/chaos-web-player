// Chaos Radio — Player store (Zustand)
// Stato globale del player: traccia corrente, coda, stato di riproduzione.
// L'<audio> effettivo vive in useAudioEngine e sincronizza qui dentro.

import { create } from "zustand";
import type { Track } from "../types/api";

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

export const usePlayerStore = create<PlayerState>((set, get) => ({
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

  toggle: () => set({ isPlaying: !get().isPlaying }),

  setPlaying: (b) => set({ isPlaying: b }),

  next: () => {
    const { queue, queueIndex } = get();
    if (queueIndex < queue.length - 1) {
      const nextIdx = queueIndex + 1;
      set({
        queueIndex: nextIdx,
        currentTrack: queue[nextIdx],
        progress: 0,
        isPlaying: true,
      });
    }
  },

  prev: () => {
    const { queue, queueIndex } = get();
    if (queueIndex > 0) {
      const prevIdx = queueIndex - 1;
      set({
        queueIndex: prevIdx,
        currentTrack: queue[prevIdx],
        progress: 0,
        isPlaying: true,
      });
    }
  },

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
}));