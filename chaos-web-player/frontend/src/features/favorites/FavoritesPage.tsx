// Chaos Radio — FavoritesPage
// Titolo "USER FAVORITES" — lista dei brani messi like dall'utente corrente.
// Click su un brano → avvia la riproduzione (vai al player).
// Riusa useFavoritesStore (mantiene gli ID preferiti come Set) e TrackListItem.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../../components/AppShell";
import type { TabKey } from "../../components/BottomNav";
import Spinner from "../../components/ui/Spinner";
import EmptyState from "../../components/ui/EmptyState";
import TrackListItem from "../../components/TrackListItem";
import { usePlayerStore } from "../../store/playerStore";
import { useNotificationsStore } from "../../store/notificationsStore";
import { useFavoritesStore } from "../../store/favoritesStore";
import { api, ApiError } from "../../lib/api";
import type { Track } from "../../types/api";

export default function FavoritesPage() {
  const navigate = useNavigate();
  const unread = useNotificationsStore((s) => s.unreadCount());
  const onTabChange = (k: TabKey) => navigate(`/${k}`);

  const fetchFavorites = useFavoritesStore((s) => s.fetch);
  const favoriteIds = useFavoritesStore((s) => s.favoriteIds);

  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch dei preferiti dell'utente corrente
  useEffect(() => {
    let cancelled = false;
    fetchFavorites();
    api
      .get<Track[]>("/favorites")
      .then((data) => {
        if (cancelled) return;
        setTracks(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? `Impossibile caricare i preferiti (${err.status})`
            : "Errore di rete",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [fetchFavorites]);

  const handlePlay = (track: Track) => {
    if (!tracks || tracks.length === 0) return;
    usePlayerStore.getState().playTrack(track, tracks);
    navigate("/player");
  };

  return (
    <AppShell
      activeTab="favorites"
      onTabChange={onTabChange}
      hasNotifications={unread > 0}
    >
      <h1 className="text-3xl font-bold tracking-tight">USER FAVORITES</h1>

      {tracks === null && !error && (
        <div className="mt-8 flex justify-center">
          <Spinner />
        </div>
      )}

      {error && <EmptyState title="Errore" message={error} />}

      {tracks && tracks.length === 0 && (
        <div className="mt-8">
          <EmptyState
            title="Nessun preferito"
            message="Tocca il cuore su un brano per aggiungerlo ai preferiti."
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