// Chaos Radio — PlaylistPage
// Titolo "SHOW LIST" — lista di tutti i brani disponibili.
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
import { useFavoritesStore } from "../../store/favoritesStore";
import { api, ApiError } from "../../lib/api";
import type { Track } from "../../types/api";

export default function PlaylistPage() {
  const navigate = useNavigate();
  const unread = useNotificationsStore((s) => s.unreadCount());
  const onTabChange = (k: TabKey) => navigate(`/${k}`);

  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const favoriteIds = useFavoritesStore((s) => s.favoriteIds);
  const fetchFavorites = useFavoritesStore((s) => s.fetch);

  // Fetch brani
  const loadTracks = () => {
    setError(null);
    setTracks(null);
    api
      .get<Track[]>("/tracks")
      .then((data) => {
        setTracks(data);
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
    fetchFavorites();
  }, [fetchFavorites]);

  const handlePlay = (track: Track) => {
    if (!tracks) return;
    usePlayerStore.getState().playTrack(track, tracks);
    navigate("/player");
  };

  return (
    <AppShell
      activeTab="playlist"
      onTabChange={onTabChange}
      hasNotifications={unread > 0}
    >
      <h1 className="text-3xl font-bold tracking-tight">SHOW LIST</h1>

      {tracks === null && !error && <LoadingView />}

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

      {tracks && tracks.length === 0 && (
        <div className="mt-8">
          <EmptyState
            variant="empty"
            title="Playlist vuota"
            message="Nessun brano disponibile al momento. Torna più tardi."
          />
        </div>
      )}

      {tracks && tracks.length > 0 && (
        <ul className="mt-6 flex flex-col gap-6">
          {tracks.map((track) => (
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