// Chaos Radio — PlayerPage
// Refactor di ChaosRadioPlayer.jsx con audio reale (useAudioEngine) + playerStore.
// Layout fedele all'originale: cover, title, meta, waveform (clickable), time, controls, queue.

import { useEffect, useState, useMemo, useRef } from "react";
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
  LogOut,
} from "lucide-react";
import AppShell from "../../components/AppShell";
import type { TabKey } from "../../components/BottomNav";
import LoadingView from "../../components/ui/LoadingView";
import EmptyState from "../../components/ui/EmptyState";
import FavoriteButton from "../../components/FavoriteButton";
import TrackListItem from "../../components/TrackListItem";
import { usePlayerStore } from "../../store/playerStore";
import { useNotificationsStore } from "../../store/notificationsStore";
import { useAuthStore } from "../../store/authStore";
import { api, ApiError } from "../../lib/api";
import { formatTime } from "../../lib/format";
import { seekAudio } from "../../audio/useAudioEngine";
import type { Track } from "../../types/api";

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

// 64 barre waveform seedate per look "stabile" tra render
function useWaveform(count = 64) {
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

  const {
    currentTrack,
    isPlaying,
    isMuted,
    progress,
    setQueue,
    toggle,
    next,
    prev,
    setMuted,
    setProgress,
  } = usePlayerStore();

  // Recupera i brani al primo mount
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const logout = useAuthStore((s) => s.logout);

  const loadTracks = () => {
    setError(null);
    setTracks(null);
    api
      .get<Track[]>("/tracks")
      .then((data) => {
        setTracks(data);
        // Auto-play del primo brano se la coda è vuota
        if (data.length > 0 && !usePlayerStore.getState().currentTrack) {
          setQueue(data, 0);
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

  // Chiudi menu contestuale al click fuori
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
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

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate("/login", { replace: true });
  };

  // Stato caricamento
  if (tracks === null && !error) {
    return (
      <AppShell
        activeTab="player"
        onTabChange={onTabChange}
        hasNotifications={unread > 0}
      >
        <LoadingView />
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell
        activeTab="player"
        onTabChange={onTabChange}
        hasNotifications={unread > 0}
      >
        <EmptyState
          variant="error"
          title="Errore"
          message={error}
          action={{ label: "Riprova", onClick: loadTracks }}
        />
      </AppShell>
    );
  }

  if (!tracks || tracks.length === 0) {
    return (
      <AppShell
        activeTab="player"
        onTabChange={onTabChange}
        hasNotifications={unread > 0}
        showHeader={false}
      >
        <div className="flex items-center justify-between pb-2 pt-[env(safe-area-inset-top,0px)]">
          <div className="w-9" />
          <span className="text-lg font-bold tracking-tight">CHAOS RADIO</span>
          <button
            onClick={handleLogout}
            aria-label="Esci"
            className="rounded p-2 text-white/40 transition-opacity hover:opacity-100 hover:text-white"
          >
            <LogOut size={18} />
          </button>
        </div>
        <EmptyState
          variant="empty"
          title="Nessun brano"
          message="L'admin non ha ancora caricato MP3. Torna più tardi."
        />
      </AppShell>
    );
  }

  // Nessun brano in riproduzione ma ci sono brani: prendi il primo
  if (!currentTrack) {
    setQueue(tracks, 0);
  }

  const effectiveTrack = currentTrack ?? tracks[0];
  const coverUrl = effectiveTrack.coverPath
    ? `${API_URL}/tracks/${effectiveTrack.id}/cover`
    : null;
  const duration = effectiveTrack.durationSeconds ?? 0;
  const currentSeconds = progress * duration;
  // (queueIndex logica gestita dentro useAudioEngine)

  return (
    <AppShell
      activeTab="player"
      onTabChange={onTabChange}
      hasNotifications={unread > 0}
      showHeader={false}
    >
      {/* Top bar minimale sul Player: brand + menu logout */}
      <div className="mb-6 flex items-center justify-between">
        <span className="text-lg font-bold tracking-tight">CHAOS RADIO</span>
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menu utente"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="rounded p-2 text-white/60 transition-opacity hover:opacity-100 hover:text-white"
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: "#FF5A1F" }}
              aria-hidden="true"
            />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-40 mt-2 min-w-[160px] rounded-md border border-white/10 bg-neutral-950 py-1 shadow-lg"
            >
              <button
                role="menuitem"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-white/90 transition-colors hover:bg-white/5"
              >
                <LogOut size={16} aria-hidden="true" />
                Esci
              </button>
            </div>
          )}
        </div>
      </div>

      <PlayerView
        track={effectiveTrack}
        coverUrl={coverUrl}
        queue={tracks}
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
        onPlay={(t) => usePlayerStore.getState().playTrack(t, tracks)}
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
  isPlaying: boolean;
  isMuted: boolean;
  progress: number;
  currentSeconds: number;
  duration: number;
  onToggle: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (e: React.MouseEvent<HTMLDivElement>) => void;
  onShare: () => void;
  onMute: () => void;
  onPlay: (t: Track) => void;
}

function PlayerView({
  track,
  coverUrl,
  queue,
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
}: PlayerViewProps) {
  const [queueOpen, setQueueOpen] = useState(true);
  const bars = useWaveform(64);

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
          <FavoriteButton
            trackId={track.id}
            size={22}
          />
        </div>
      </div>

      {/* Meta row */}
      <div className="mt-3 flex items-center justify-between text-sm text-white/40">
        <span>{track.year ?? "—"}</span>
        <span>{track.genres?.join(", ") ?? "—"}</span>
      </div>

      {/* Waveform */}
      <div
        className="mt-4 flex h-16 cursor-pointer items-center gap-[2px]"
        onClick={onSeek}
        role="slider"
        aria-label="Posizione riproduzione"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
      >
        {bars.map((h, i) => {
          const played = i / bars.length < progress;
          return (
            <span
              key={i}
              className="w-full rounded-full"
              style={{
                height: `${h * 100}%`,
                backgroundColor: played
                  ? "#FF5A1F"
                  : "rgba(255,255,255,0.35)",
              }}
            />
          );
        })}
      </div>

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
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}