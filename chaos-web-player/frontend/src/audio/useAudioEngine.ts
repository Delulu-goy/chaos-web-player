// Chaos Radio — Audio engine singleton
// Un solo HTMLAudioElement in tutta l'app, montato da AppShell.
// Espone API reattive via Zustand (playerStore) + Media Session API.

import { useEffect } from "react";
import { usePlayerStore } from "../store/playerStore";

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

/**
 * URL completo per stream audio autenticato.
 * Il cookie httpOnly viene inviato automaticamente da credentials: 'include'
 * perché lo stesso fetch wrapper è usato per la chiamata <audio>.src? No:
 * <audio>.src NON supporta credentials. Soluzione: usare un blob URL ottenuto
 * da un fetch con credenziali, oppure streamare attraverso un service worker.
 *
 * MVP: per semplicità il backend ESPONE lo stream con un check sul cookie
 * della SAME ORIGIN request (no CORS). Il browser invia automaticamente
 * i cookie same-origin all'attributo src di <audio>.
 *
 * Se il frontend gira su origin A e backend su origin B, serve un workaround
 * (proxy Vite in dev, oppure signed URL in prod). Per ora: same-origin.
 */
function streamUrl(trackId: number): string {
  return `${BASE_URL}/tracks/${trackId}/stream`;
}

function coverUrl(trackId: number): string {
  return `${BASE_URL}/tracks/${trackId}/cover`;
}

/**
 * Hook da chiamare UNA VOLTA nell'app (in AppShell).
 * Crea e gestisce il singleton HTMLAudioElement.
 */
export function useAudioEngine() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const volume = usePlayerStore((s) => s.volume);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const next = usePlayerStore((s) => s.next);

  // Singleton audio element
  const audio = useSingletonAudio();

  // Cambio traccia → aggiorna src
  useEffect(() => {
    if (!audio || !currentTrack) return;
    audio.src = streamUrl(currentTrack.id);
    audio.load();
  }, [audio, currentTrack?.id]);

  // Sync play/pause
  useEffect(() => {
    if (!audio || !currentTrack) return;
    if (isPlaying) {
      audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }, [audio, isPlaying, currentTrack?.id]);

  // Sync mute/volume
  useEffect(() => {
    if (!audio) return;
    audio.muted = isMuted;
    audio.volume = volume;
  }, [audio, isMuted, volume]);

  // Media Session API (controlli lock screen / notification)
  useEffect(() => {
    if (!currentTrack) return;

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: "Chaos Radio",
        ...(currentTrack.coverPath
          ? { artwork: [{ src: coverUrl(currentTrack.id), sizes: "512x512", type: "image/jpeg" }] }
          : {}),
      });

      navigator.mediaSession.setActionHandler("play", () => setPlaying(true));
      navigator.mediaSession.setActionHandler("pause", () => setPlaying(false));
      navigator.mediaSession.setActionHandler("nexttrack", () => next());
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        usePlayerStore.getState().prev();
      });
    }
  }, [currentTrack?.id]);
}

/**
 * Crea (o riusa in StrictMode/dev) l'<audio> singleton.
 * Ritorna l'elemento e aggancia i listener base.
 */
function useSingletonAudio(): HTMLAudioElement | null {
  useEffect(() => {
    const audio = ensureAudioElement();
    const onTimeUpdate = () => {
      if (!audio.duration || Number.isNaN(audio.duration)) return;
      usePlayerStore.getState().setProgress(audio.currentTime / audio.duration);
    };
    const onEnded = () => {
      const state = usePlayerStore.getState();
      const isLast = state.queueIndex >= state.queue.length - 1;
      if (isLast) {
        state.setPlaying(false);
      } else {
        state.next();
      }
    };
    const onPause = () => usePlayerStore.getState().setPlaying(false);
    const onPlay = () => usePlayerStore.getState().setPlaying(true);
    const onError = () => usePlayerStore.getState().setPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("error", onError);
    };
  }, []);

  return typeof window !== "undefined" ? ensureAudioElement() : null;
}

let audioEl: HTMLAudioElement | null = null;
function ensureAudioElement(): HTMLAudioElement {
  if (audioEl) return audioEl;
  audioEl = new Audio();
  audioEl.preload = "metadata";
  audioEl.crossOrigin = "use-credentials"; // hint per CORS quando cross-origin
  return audioEl;
}

/**
 * Permette di seek-are programmaticamente dall'esterno (es. click sulla waveform).
 */
export function seekAudio(ratio: number) {
  const audio = ensureAudioElement();
  if (!audio.duration || Number.isNaN(audio.duration)) return;
  audio.currentTime = ratio * audio.duration;
}