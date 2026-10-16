// Chaos Radio — PirateDayPage
// Titolo "PIRATE DAY #NN" con countdown "Xh.Ym left" + barra di progresso orizzontale.
// Descrizione (con supporto **bold inline** in evidenza arancione).
// CuratorCard con avatar/nome/ruolo/social.
// Lista brani della playlist (TrackListItem riusato).
//
// Fetch: GET /api/playlists/pirate-day (restituisce 404 se nessuna playlist attiva).

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../../components/AppShell";
import type { TabKey } from "../../components/BottomNav";
import Spinner from "../../components/ui/Spinner";
import EmptyState from "../../components/ui/EmptyState";
import TrackListItem from "../../components/TrackListItem";
import CuratorCard from "../../components/CuratorCard";
import { usePlayerStore } from "../../store/playerStore";
import { useNotificationsStore } from "../../store/notificationsStore";
import { useFavoritesStore } from "../../store/favoritesStore";
import { api, ApiError } from "../../lib/api";
import { formatCountdown } from "../../lib/format";
import type { PirateDayResponse, Track } from "../../types/api";

/**
 * Parser minimal della descrizione: supporta **testo** per highlight
 * (rendering in arancione + bold), resto plain text con whitespace preservato.
 */
function renderDescription(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(part);
    if (m) {
      return (
        <span
          key={i}
          className="font-bold"
          style={{ color: "#FF5A1F" }}
        >
          {m[1]}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function PirateDayPage() {
  const navigate = useNavigate();
  const unread = useNotificationsStore((s) => s.unreadCount());
  const onTabChange = (k: TabKey) => navigate(`/${k}`);

  const fetchFavorites = useFavoritesStore((s) => s.fetch);
  const favoriteIds = useFavoritesStore((s) => s.favoriteIds);

  const [data, setData] = useState<PirateDayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Countdown aggiornato ogni secondo
  const [now, setNow] = useState(() => Date.now());

  // Fetch playlist pirate-day corrente
  useEffect(() => {
    let cancelled = false;
    api
      .get<PirateDayResponse>("/playlists/pirate-day")
      .then((d) => {
        if (cancelled) return;
        setData(d);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          // Nessuna playlist attiva: non è un errore UX
          setData(null);
          return;
        }
        setError(
          err instanceof ApiError
            ? `Impossibile caricare Pirate Day (${err.status})`
            : "Errore di rete",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Pre-fetch preferiti per stato cuori nella lista
  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  // Tick countdown
  useEffect(() => {
    if (!data?.endsAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [data?.endsAt]);

  const handlePlay = (track: Track) => {
    if (!data) return;
    usePlayerStore.getState().playTrack(track, data.items);
    navigate("/player");
  };

  // ─── Loading ────────────────────────────────────────────────────────
  if (data === null && !error) {
    return (
      <AppShell
        activeTab="pirate-day"
        onTabChange={onTabChange}
        hasNotifications={unread > 0}
      >
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell
        activeTab="pirate-day"
        onTabChange={onTabChange}
        hasNotifications={unread > 0}
      >
        <EmptyState title="Errore" message={error} />
      </AppShell>
    );
  }

  // ─── Nessuna playlist pirate-day attiva ─────────────────────────────
  if (!data) {
    return (
      <AppShell
        activeTab="pirate-day"
        onTabChange={onTabChange}
        hasNotifications={unread > 0}
      >
        <h1 className="text-3xl font-bold tracking-tight">PIRATE DAY</h1>
        <div className="mt-8">
          <EmptyState
            title="Nessuna playlist attiva"
            message="Torna più tardi: al momento Pirate Day non è in onda."
          />
        </div>
      </AppShell>
    );
  }

  // ─── Rendering ──────────────────────────────────────────────────────
  const countdown = data.endsAt ? formatCountdown(data.endsAt) : null;

  // Calcolo progresso: quanto tempo è passato rispetto alla durata totale
  // (da startsAt a endsAt). Se startsAt mancante, fallback su una finestra 24h.
  let progress = 0;
  if (data.endsAt) {
    const endsMs = new Date(data.endsAt).getTime();
    const startsMs = data.startsAt
      ? new Date(data.startsAt).getTime()
      : endsMs - 24 * 60 * 60 * 1000;
    const total = Math.max(1, endsMs - startsMs);
    const elapsed = now - startsMs;
    progress = Math.min(1, Math.max(0, elapsed / total));
  }

  return (
    <AppShell
      activeTab="pirate-day"
      onTabChange={onTabChange}
      hasNotifications={unread > 0}
    >
      {/* Header: titolo + countdown + barra */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <h1 className="text-3xl font-bold tracking-tight">{data.title}</h1>
        <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
          {countdown && (
            <span className="font-mono text-sm text-white/60">{countdown}</span>
          )}
          <div
            className="h-1.5 w-32 overflow-hidden rounded-full bg-white/15 sm:w-40"
            role="progressbar"
            aria-valuenow={Math.round((1 - progress) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Tempo rimanente Pirate Day"
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(1 - progress) * 100}%`,
                backgroundColor: "#FF5A1F",
              }}
            />
          </div>
        </div>
      </div>

      {/* Description */}
      {data.description && (
        <p className="mt-6 whitespace-pre-line leading-relaxed text-white/80">
          {renderDescription(data.description)}
        </p>
      )}

      {/* Curator */}
      {data.curator.name && (
        <div className="mt-6">
          <CuratorCard curator={data.curator} />
        </div>
      )}

      {/* Track list */}
      {data.items.length === 0 ? (
        <div className="mt-12">
          <EmptyState
            title="Playlist vuota"
            message="Il curatore non ha ancora aggiunto brani."
          />
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-6">
          {data.items.map((track) => (
            <li key={track.id}>
              <TrackListItem
                track={track}
                initialLiked={favoriteIds.has(track.id)}
                onPlay={handlePlay}
              />
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}