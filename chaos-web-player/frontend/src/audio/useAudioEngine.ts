// Chaos Radio — Audio engine singleton
// Un solo HTMLAudioElement in tutta l'app, montato da AppShell.
// Espone API reattive via Zustand (playerStore) + Media Session API.
//
// ── Architettura: desired state vs actual state ─────────────────────────
// `playerStore.isPlaying` è il DESIRED state (l'intenzione dell'utente).
// L'HTMLAudioElement è l'attuatore. Gli eventi DOM del media element NON
// scrivono il desired state (salvo l'interrupt del sistema operativo),
// per evitare loop di feedback che desincronizzano store ed elemento.
//
// Tre race condition gestite esplicitamente:
//
//  1. AbortError — `audio.play()` rifiuta con AbortError quando un cambio
//     traccia (o un pause) aborted il caricamento in corso. NON è un errore:
//     ignorarlo evita di mettere in pausa la traccia appena selezionata.
//
//  2. Generazione — ogni cambio traccia incrementa un contatore. Gli errori
//     delle richieste obsolete (AbortError inclusi) non toccano più lo store.
//
//  3. Pause spurio — `audio.load()` firea un evento `pause` asincrono.
//     Quando readyState è HAVE_NOTHING quell'evento è causato dal load e
//     non da un'intenzione dell'utente → va ignorato.
//
// ── Precaricamento ───────────────────────────────────────────────────────
// La traccia successiva viene scaricata in background con un <audio> separato:
// il cambio traccia diventa istantaneo e non blocca sul download.

import { useEffect, useRef, useState } from "react";
import { usePlayerStore } from "../store/playerStore";
import { toast } from "../store/toastStore";
import { trackCoverUrl, trackStreamUrl } from "../lib/media";

/**
 * Nota sullo stream audio: il cookie httpOnly viene inviato
 * automaticamente a credentials: 'include' perché lo stesso fetch wrapper
 * è usato per la chiamata <audio>.src? No: <audio>.src NON supporta
 * credentials. Soluzione: usare un blob URL ottenuto da un fetch con
 * credenziali, oppure streamare attraverso un service worker.
 *
 * MVP: per semplicità il backend ESPONE lo stream con un check sul cookie
 * della SAME ORIGIN request (no CORS). Il browser invia automaticamente
 * i cookie same-origin all'attributo src di <audio>.
 *
 * Se il frontend gira su origin A e backend su origin B, serve un workaround
 * (proxy Vite in dev, oppure signed URL in prod). Per ora: same-origin.
 */

/**
 * Hook da chiamare UNA VOLTE nell'app (in AppShell).
 * Crea e gestisce il singleton HTMLAudioElement.
 */
export function useAudioEngine() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const volume = usePlayerStore((s) => s.volume);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const next = usePlayerStore((s) => s.next);
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);

  // Singleton audio element
  const audio = useSingletonAudio();

  // Contatore di generazione: invalida le richieste obsolete.
  const genRef = useRef(0);

  /**
   * Gestisce il rifiuto di audio.play().
   * - AbortError → cambio traccia / pause: esito normale, non un errore.
   * - generazione obsoleta → un cambio traccia più recente ha già preso
   *   il posto: ignoriamo.
   * - altrimenti → errore reale: fermiamo e avvisiamo l'utente.
   */
  const handlePlayError = (err: unknown, gen: number) => {
    if (err instanceof DOMException && err.name === "AbortError") return;
    if (gen !== genRef.current) return;

    setPlaying(false);

    if (err instanceof DOMException && err.name === "NotAllowedError") {
      toast.error("Autoplay bloccato dal browser. Tocca play per ripartire.");
    } else {
      toast.error("Impossibile avviare la riproduzione.");
    }
  };

  // ── Cambio traccia → nuova sorgente ──────────────────────────────────
  // Solo qui si tocca `src`: il reconcile play/pause è in un effect separato
  // per non ricaricare il brano a ogni pressione del tasto play/pause.
  useEffect(() => {
    if (!audio) return;

    genRef.current += 1;

    if (!currentTrack) {
      // Nessun brano in coda (es. reset dopo logout): ferma tutto e libera
      // l'elemento audio, altrimenti continua a suonare il brano vecchio.
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      return;
    }

    audio.src = trackStreamUrl(currentTrack.id);
    audio.load();
  }, [audio, currentTrack?.id]);

  // ── Reconcile: desired state → elemento audio ─────────────────────────
  // `audio.paused` rende l'effect idempotente: non chiamo play/pause se
  // l'elemento è già nello stato desiderato.
  useEffect(() => {
    if (!audio || !currentTrack) return;

    if (isPlaying) {
      if (audio.paused) {
        const gen = genRef.current;
        audio.play().then(
          () => {
            // Tra la richiesta e l'avvio effettivo l'utente può aver
            // premuto pause: in quel caso fermiamo subito. Senza questo
            // guard, play() partirebbe comunque dopo il pause.
            if (!usePlayerStore.getState().isPlaying) {
              audio.pause();
            }
          },
          (err) => handlePlayError(err, gen),
        );
      }
    } else {
      // Chiamare pause() su un elemento già in pausa è un no-op, ma è
      // comunque l'unico modo per abortire un play() pendente.
      audio.pause();
    }
  }, [audio, isPlaying, currentTrack?.id]);

  // ── Sync mute/volume ──────────────────────────────────────────────────
  useEffect(() => {
    if (!audio) return;
    audio.muted = isMuted;
    audio.volume = volume;
  }, [audio, isMuted, volume]);

  // ── Precarica la traccia successiva ───────────────────────────────────
  // Un <audio> separato, non agganciato al DOM, con preload="auto".
  useEffect(() => {
    const nextTrack = queue[queueIndex + 1];
    if (!nextTrack) return;

    const preloader = new Audio();
    preloader.preload = "auto";
    preloader.src = trackStreamUrl(nextTrack.id);

    return () => {
      // Cleanup: aborta il download in corso quando la coda cambia.
      preloader.removeAttribute("src");
      preloader.load();
    };
  }, [queue, queueIndex]);

  // ── Media Session API (controlli lock screen / notification) ───────────
  useEffect(() => {
    if (!currentTrack) return;

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: "Chaos Radio",
        ...(currentTrack.coverPath
          ? { artwork: [{ src: trackCoverUrl(currentTrack.id), sizes: "512x512", type: "image/jpeg" }] }
          : {}),
      });

      navigator.mediaSession.setActionHandler("play", () => setPlaying(true));
      navigator.mediaSession.setActionHandler("pause", () => setPlaying(false));
      navigator.mediaSession.setActionHandler("nexttrack", () => next());
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        usePlayerStore.getState().prev();
      });
      navigator.mediaSession.setActionHandler("seekforward", () => {
        seekBy(10);
      });
      navigator.mediaSession.setActionHandler("seekbackward", () => {
        seekBy(-10);
      });
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (typeof details.seekTime === "number") {
          seekToTime(details.seekTime);
        }
      });
    }
  }, [currentTrack?.id]);
}

/**
 * Crea (o riusa in StrictMode/dev) l'<audio> singleton.
 * Ritorna l'elemento e aggancia i listener base.
 */
function useSingletonAudio(): HTMLAudioElement | null {
  // Lazy init: l'elemento viene creato una sola volta, non durante il
  // render come side effect. ensureAudioElement() è idempotente
  // (singleton module-level), quindi è sicuro anche in StrictMode.
  const [audio] = useState<HTMLAudioElement | null>(() =>
    typeof window !== "undefined" ? ensureAudioElement() : null,
  );

  useEffect(() => {
    if (!audio) return;
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
    const onPause = () => {
      // readyState HAVE_NOTHING = l'elemento è in fase di (ri)caricamento:
      // l'evento `pause` è la conseguenza di load(), non un'intenzione
      // dell'utente → ignorato. Altrimenti è un interrupt reale
      // (telefonata, cuffie staccate) e il store va sincronizzato.
      if (audio.readyState === audio.HAVE_NOTHING) return;
      usePlayerStore.getState().setPlaying(false);
    };
    const onError = () => {
      // Errore riproduzione (rete, formato non supportato, 401, 404, ecc.)
      usePlayerStore.getState().setPlaying(false);
      // Messaggio specifico per errori di rete
      const code = audioEl?.error?.code;
      const msg =
        code === MediaError.MEDIA_ERR_NETWORK
          ? "Errore di rete durante la riproduzione."
          : "Impossibile riprodurre il brano.";
      toast.error(msg);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
    };
  }, [audio]);

  return audio;
}

let audioEl: HTMLAudioElement | null = null;
function ensureAudioElement(): HTMLAudioElement {
  if (audioEl) return audioEl;
  audioEl = new Audio();
  audioEl.preload = "auto";
  // NB: niente `crossOrigin`. Le richieste sono same-origin (stesso dominio
  // del backend in produzione, proxy Vite in dev): impostarlo metterebbe
  // l'elemento in CORS mode senza alcun vantaggio e complica il caching.
  return audioEl;
}

// ── Seek throttled ───────────────────────────────────────────────────────
// Ogni seek è una nuova HTTP Range request: il browser abbatte la precedente
// e ne apre un'altra. Click ripetuti sulla waveform (o un drag) genererebbero
// decine di richieste abortite in pochi secondi. Coalesciamo con un
// leading-edge immediato + trailing edge con l'ultima ratio.
const SEEK_THROTTLE_MS = 120;
let lastSeekAt = 0;
let pendingSeekRatio: number | null = null;
let seekTimer: number | null = null;

function applySeekRatio(ratio: number) {
  const audio = ensureAudioElement();
  if (!audio.duration || Number.isNaN(audio.duration)) return;
  const target = ratio * audio.duration;
  try {
    audio.currentTime = target;
  } catch {
    // currentTime non impostabile (readyState non valido): il timeupdate
    // successivo riporterà comunque la posizione reale.
  }
}

/**
 * Permette di seek-are programmaticamente dall'esterno (es. click sulla waveform).
 */
export function seekAudio(ratio: number) {
  const audio = ensureAudioElement();
  if (!audio.duration || Number.isNaN(audio.duration)) return;

  const now = Date.now();
  const elapsed = now - lastSeekAt;

  if (elapsed >= SEEK_THROTTLE_MS) {
    lastSeekAt = now;
    applySeekRatio(ratio);
    return;
  }

  // Finestra ancora aperta: accoda l'ultima ratio e applicala alla scadenza.
  pendingSeekRatio = ratio;
  if (seekTimer !== null) return;
  seekTimer = window.setTimeout(() => {
    seekTimer = null;
    if (pendingSeekRatio === null) return;
    const r = pendingSeekRatio;
    pendingSeekRatio = null;
    lastSeekAt = Date.now();
    applySeekRatio(r);
  }, SEEK_THROTTLE_MS - elapsed);
}

/**
 * Seek relativo in secondi (usato dai controlli Media Session).
 */
export function seekBy(deltaSeconds: number) {
  const audio = ensureAudioElement();
  if (!audio.duration || Number.isNaN(audio.duration)) return;
  const target = Math.min(
    audio.duration,
    Math.max(0, audio.currentTime + deltaSeconds),
  );
  seekToTime(target);
}

/**
 * Seek assoluto in secondi (usato dal Media Session "seekto").
 */
export function seekToTime(seconds: number) {
  const audio = ensureAudioElement();
  if (!audio.duration || Number.isNaN(audio.duration)) return;
  const ratio = Math.min(1, Math.max(0, seconds / audio.duration));
  seekAudio(ratio);
}
