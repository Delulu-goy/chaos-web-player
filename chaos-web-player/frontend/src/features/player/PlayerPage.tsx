// Chaos Radio — PlayerPage
// Refactor di ChaosRadioPlayer.jsx con audio reale (useAudioEngine) + playerStore.
// Layout fedele all'originale: cover, title, meta, waveform (clickable), time, controls, queue.
//
// La lista "ON QUEUE" mostra la coda REALE (quella dello store), non tutta
// la libreria: la coda è sempre show list OPPURE pirate day, mai una
// miscela (invariante I5).

import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Share2,
  Repeat,
  SkipBack,
  Play,
  Pause,
  SkipForward,
  Volume2,
  VolumeX,
  ChevronDown,
} from "lucide-react";
import AppShell from "../../components/AppShell";
import type { TabKey } from "../../components/BottomNav";
import LoadingView from "../../components/ui/LoadingView";
import EmptyState from "../../components/ui/EmptyState";
import FavoriteButton from "../../components/FavoriteButton";
import TrackListItem from "../../components/TrackListItem";
import Waveform from "../../components/Waveform";
import { usePlayerStore } from "../../store/playerStore";
import type { QueueSource } from "../../store/playerStore";
import { useNotificationsStore } from "../../store/notificationsStore";
import { api, ApiError } from "../../lib/api";
import { formatTime } from "../../lib/format";
import { useTrackWaveform } from "../../hooks/useTrackWaveform";
import { seekAudio } from "../../audio/useAudioEngine";
import { trackCoverUrl } from "../../lib/media";
import type { ShowListResponse, Track } from "../../types/api";

// Barre decorative di fallback: usate solo quando il brano non ha ancora
// la waveform reale (non ancora calcolata lato server).
function useFallbackBars(count = 64) {
  return useMemo(() => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    return Array.from({ length: count }, () => 0.25 + rand() * 0.75);
  }, [count]);
}

export default function PlayerPage() {
  const navigate = useNavigate();
  const unread = useNotificationsStore((s) => s.unreadCount());
  const onTabChange = (k: TabKey) => navigate(`/${k}`);

  // Selettori invece di `usePlayerStore()` per intero: senza selettore
  // OGNI variazione dello store (incluso `progress`, aggiornato 4 volte/s
  // dal timeupdate) ri-renderizza l'intera pagina. Con i selettori
  // ri-renderizza solo quando cambia davvero un valore usato.
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const queue = usePlayerStore((s) => s.queue);
  const queueSource = usePlayerStore((s) => s.queueSource);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const progress = usePlayerStore((s) => s.progress);
  const toggle = usePlayerStore((s) => s.toggle);
  const next = usePlayerStore((s) => s.next);
  const prev = usePlayerStore((s) => s.prev);
  const setMuted = usePlayerStore((s) => s.setMuted);
  const setProgress = usePlayerStore((s) => s.setProgress);

  // Waveform reale del brano in riproduzione (picchi calcolati lato
  // server). Null se il brano non è ancora stato processato: in quel caso
  // il player mostra le barre decorative di fallback.
  const waveformPeaks = useTrackWaveform(currentTrack?.id ?? null);

  // Libreria fisica (`/tracks`): serve SOLO per validare che il brano
  // ripristinato dal localStorage esista ancora. Endpoint invariato:
  // include anche i brani del pirate day (escluderli farebbe resettare
  // la coda a un utente che sta ascoltando proprio quelli).
  const [library, setLibrary] = useState<Track[] | null>(null);
  // Show list: la coda di default quando lo store non ha una coda.
  const [showList, setShowList] = useState<Track[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTracks = () => {
    setError(null);
    setLibrary(null);
    setShowList(null);
    Promise.all([
      api.get<Track[]>("/tracks"),
      api.get<ShowListResponse>("/playlists/show-list"),
    ])
      .then(([lib, sl]) => {
        setLibrary(lib);
        setShowList(sl.items);

        // Lo stato persistito può contenere un brano che non è più in
        // libreria (scan/seed lo hanno rimosso, oppure è un brano del
        // pirate day whose edition just expired). Se il brano ripristinato
        // non esiste più, ripartiamo dalla show list; se invece esiste
        // lo teniamo, e l'utente riprende da dove aveva lasciato.
        const restored = usePlayerStore.getState().currentTrack;
        const stillThere =
          restored !== null && lib.some((t) => t.id === restored.id);

        if (!stillThere) {
          if (sl.items.length > 0) {
            usePlayerStore.getState().setQueue(sl.items, 0, "show-list");
          } else {
            usePlayerStore.getState().reset();
          }
        }
      })
      .catch((err) => {
        setError(
          err instanceof ApiError
            ? `Impossibile caricare i brani (${err.status})`
            : "Errore di rete",
        );
      });
  };

  useEffect(() => {
    loadTracks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Feedback visivo immediato; il seek audio è throttled dentro
  // seekAudio() per non aprire una Range request HTTP per ogni evento.
  const handleSeek = (ratio: number) => {
    setProgress(ratio);
    seekAudio(ratio);
  };

  const handleShare = () => {
    if (!currentTrack) return;
    const url = `${window.location.origin}/player`;
    if (navigator.share) {
      navigator.share({ title: currentTrack.title, text: currentTrack.artist, url });
    } else {
      void navigator.clipboard?.writeText(url);
    }
  };

  // Stato caricamento
  if (library === null && !error) {
    return (
      <AppShell activeTab="player" onTabChange={onTabChange} hasNotifications={unread > 0}>
        <LoadingView />
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell activeTab="player" onTabChange={onTabChange} hasNotifications={unread > 0}>
        <EmptyState
          variant="error"
          title="Errore"
          message={error}
          action={{ label: "Riprova", onClick: loadTracks }}
        />
      </AppShell>
    );
  }

  // Coda mostrata: quella dello store. Se è vuota (prima apertura, o brano
  // rimosso) si mostra la show list, che è la coda di default.
  const effectiveQueue = queue.length > 0 ? queue : (showList ?? []);
  // Provenienza della coda mostrata: la coda dello store, oppure la show
  // list quando la coda è vuota.
  const effectiveSource: QueueSource =
    queue.length > 0 ? queueSource : "show-list";
  // Il cuore dipende dal BRANO IN PLAY (la provenienza salvata nello
  // store), non dalla lista mostrata: i brani del pirate day non sono
  // preferitabili (invariante I3).
  const showFavorite = queueSource !== "pirate-day";

  // NB: niente setQueue() nel body del render (era un side effect durante
  // il render: in StrictMode veniva eseguito due volte e poteva
  // sovrascrivere lo stato). La coda viene impostata in loadTracks().
  const effectiveTrack = currentTrack ?? effectiveQueue[0];
  if (!effectiveTrack) {
    return (
      <AppShell activeTab="player" onTabChange={onTabChange} hasNotifications={unread > 0}>
        <EmptyState
          variant="empty"
          title="Nessun brano"
          message="L'admin non ha ancora caricato MP3. Torna più tardi."
        />
      </AppShell>
    );
  }

  const coverUrl = effectiveTrack.coverPath
    ? trackCoverUrl(effectiveTrack.id)
    : null;
  const duration = effectiveTrack.durationSeconds ?? 0;
  const currentSeconds = progress * duration;
  // (queueIndex logica gestita dentro useAudioEngine)

  return (
    <AppShell activeTab="player" onTabChange={onTabChange} hasNotifications={unread > 0}>
      <PlayerView
        track={effectiveTrack}
        coverUrl={coverUrl}
        queue={effectiveQueue}
        showFavorite={showFavorite}
        isPlaying={isPlaying}
        isMuted={isMuted}
        progress={progress}
        currentSeconds={currentSeconds}
        duration={duration}
        onToggle={toggle}
        onNext={next}
        onPrev={prev}
        onSeek={handleSeek}
        onShare={handleShare}
        onMute={() => setMuted(!isMuted)}
        onPlay={(t) =>
          usePlayerStore
            .getState()
            .playTrack(t, effectiveQueue, effectiveSource)
        }
        peaks={waveformPeaks}
      />
    </AppShell>
  );
}

// ───────────────────────────────────────────────────────────────────────
// PlayerView (sub-component che riceve tutto come props per leggibilità)
// ───────────────────────────────────────────────────────────────────────

interface PlayerViewProps {
  track: Track;
  coverUrl: string | null;
  queue: Track[];
  /** False quando la coda è quella del pirate day: niente cuore preferiti. */
  showFavorite: boolean;
  isPlaying: boolean;
  isMuted: boolean;
  progress: number;
  currentSeconds: number;
  duration: number;
  onToggle: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (ratio: number) => void;
  onShare: () => void;
  onMute: () => void;
  onPlay: (t: Track) => void;
  /** Picchi reali del brano (null → fallback decorativo). */
  peaks: number[] | null;
}

function PlayerView({
  track,
  coverUrl,
  queue,
  showFavorite,
  isPlaying,
  isMuted,
  progress,
  currentSeconds,
  duration,
  onToggle,
  onNext,
  onPrev,
  onSeek,
  onShare,
  onMute,
  onPlay,
  peaks,
}: PlayerViewProps) {
  const [queueOpen, setQueueOpen] = useState(true);
  const fallbackBars = useFallbackBars(64);

  return (
    <>
      {/* Cover art */}
      <div className="aspect-square w-full overflow-hidden rounded-sm bg-neutral-900">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={track.title}
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>

      {/* Title row */}
      <div className="mt-6 flex items-start justify-between gap-4 border-t border-white/10 pt-5">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold sm:text-3xl">
            {track.title}
          </h1>
          <p className="mt-1 truncate text-lg" style={{ color: "#FF5A1F" }}>
            {track.artist}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4 pt-1">
          <button
            aria-label="Condividi"
            onClick={onShare}
            className="text-white/80 transition-opacity hover:opacity-60"
          >
            <Share2 size={22} />
          </button>
          {showFavorite ? <FavoriteButton track={track} size={22} /> : null}
        </div>
      </div>

      {/* Meta row */}
      <div className="mt-3 flex items-center justify-between text-sm text-white/40">
        <span>{track.year ?? "—"}</span>
        <span>{track.genres?.join(", ") ?? "—"}</span>
      </div>

      {/* Waveform — click, drag e tastiera per il seek */}
      <Waveform
        progress={progress}
        onSeek={onSeek}
        peaks={peaks}
        fallbackBars={fallbackBars}
      />

      {/* Time row */}
      <div className="mt-2 flex items-center justify-between text-sm">
        <span style={{ color: "#FF5A1F" }}>{formatTime(currentSeconds)}</span>
        <span className="text-white/40">{formatTime(duration)}</span>
      </div>

      {/* Controls */}
      <div className="mt-6 flex items-center justify-between border-y border-white/10 py-5">
        <button
          aria-label="Volume"
          onClick={onMute}
          className="text-white/80 transition-opacity hover:opacity-60"
        >
          {isMuted ? <VolumeX size={22} /> : <Volume2 size={22} />}
        </button>
        <button
          aria-label="Brano precedente"
          onClick={onPrev}
          className="text-white/80 transition-opacity hover:opacity-60"
        >
          <SkipBack size={26} />
        </button>
        <button
          aria-label={isPlaying ? "Pausa" : "Play"}
          onClick={onToggle}
          className="flex h-14 w-14 items-center justify-center rounded-full border-2"
          style={{ borderColor: "#FF5A1F", color: "#FF5A1F" }}
        >
          {isPlaying ? (
            <Pause size={26} fill="#FF5A1F" />
          ) : (
            <Play size={26} fill="#FF5A1F" className="ml-1" />
          )}
        </button>
        <button
          aria-label="Brano successivo"
          onClick={onNext}
          className="text-white/80 transition-opacity hover:opacity-60"
        >
          <SkipForward size={26} />
        </button>
        <button
          aria-label="Ripeti (placeholder)"
          className="text-white/40"
          disabled
        >
          <Repeat size={22} />
        </button>
      </div>

      {/* Queue */}
      <div className="mt-4">
        <button
          onClick={() => setQueueOpen((v) => !v)}
          className="flex items-center gap-2 text-sm tracking-wide text-white/70"
        >
          <ChevronDown
            size={16}
            className={`transition-transform ${queueOpen ? "" : "-rotate-90"}`}
          />
          ON QUEUE
        </button>

        {queueOpen && (
          <ul className="mt-4 flex flex-col gap-6">
            {queue.map((item) => (
              <li key={item.id}>
                <TrackListItem
                  track={item}
                  onPlay={onPlay}
                  highlightPlaying
                  showFavorite={showFavorite}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
