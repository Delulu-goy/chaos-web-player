// Chaos Radio — PlaylistPage
// Titolo "SHOW LIST" — la playlist principale della radio.
// I brani arrivano da `GET /api/playlists/show-list` (la playlist mantenuta
// dallo scanner), NON dall'intera libreria: i brani del Pirate Day non
// devono mai comparire qui.
// Click su un brano → avvia la riproduzione (vai al player).

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../../components/AppShell";
import type { TabKey } from "../../components/BottomNav";
import LoadingView from "../../components/ui/LoadingView";
import EmptyState from "../../components/ui/EmptyState";
import TrackListItem from "../../components/TrackListItem";
import { usePlayerStore } from "../../store/playerStore";
import { useNotificationsStore } from "../../store/notificationsStore";
import { api, ApiError } from "../../lib/api";
import type { ShowListResponse, Track } from "../../types/api";

export default function PlaylistPage() {
  const navigate = useNavigate();
  const unread = useNotificationsStore((s) => s.unreadCount());
  const onTabChange = (k: TabKey) => navigate(`/${k}`);

  const [items, setItems] = useState<ShowListResponse["items"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch della show list
  const loadTracks = () => {
    setError(null);
    setItems(null);
    api
      .get<ShowListResponse>("/playlists/show-list")
      .then((data) => {
        setItems(data.items);
      })
      .catch((err) => {
        setError(
          err instanceof ApiError
            ? `Impossibile caricare la playlist (${err.status})`
            : "Errore di rete",
        );
      });
  };

  useEffect(() => {
    loadTracks();
  }, []);

  const handlePlay = (track: Track) => {
    if (!items) return;
    // La coda è la show list: mai una miscela con il pirate day.
    usePlayerStore.getState().playTrack(track, items, "show-list");
    navigate("/player");
  };

  return (
    <AppShell
      activeTab="playlist"
      onTabChange={onTabChange}
      hasNotifications={unread > 0}
    >
      <h1 className="text-3xl font-bold tracking-tight">SHOW LIST</h1>

      {items === null && !error && <LoadingView />}

      {error && (
        <div className="mt-8">
          <EmptyState
            variant="error"
            title="Errore"
            message={error}
            action={{ label: "Riprova", onClick: loadTracks }}
          />
        </div>
      )}

      {items && items.length === 0 && (
        <div className="mt-8">
          <EmptyState
            variant="empty"
            title="Playlist vuota"
            message="Nessun brano disponibile al momento. Torna più tardi."
          />
        </div>
      )}

      {items && items.length > 0 && (
        <ul className="mt-6 flex flex-col gap-6">
          {items.map((track) => (
            <li key={track.id}>
              <TrackListItem
                track={track}
                onPlay={handlePlay}
                highlightPlaying
              />
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
