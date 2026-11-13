// Chaos Radio — FavoritesPage
// Titolo "USER FAVORITES" — lista dei brani messi like dall'utente corrente.
// Click su un brano → avvia la riproduzione (vai al player).
//
// La lista viene da useFavoritesStore, che è l'unica fonte di verità: il
// caricamento avviene una volta sola al login (vedi FavoritesMount in
// App.tsx) e togliendo un preferito la riga scompare subito, senza refetch.
//
// I preferiti NON sono una fonte di coda (invariante I6): partendo da un
// preferito si torna alla show list, che è la coda "ufficiale".

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
import { api } from "../../lib/api";
import type { ShowListResponse, Track } from "../../types/api";

export default function FavoritesPage() {
  const navigate = useNavigate();
  const unread = useNotificationsStore((s) => s.unreadCount());
  const onTabChange = (k: TabKey) => navigate(`/${k}`);

  const favorites = useFavoritesStore((s) => s.items);
  const isLoading = useFavoritesStore((s) => s.isLoading);
  const error = useFavoritesStore((s) => s.error);
  const fetchFavorites = useFavoritesStore((s) => s.fetch);

  // Show list: la coda da cui si riparte quando l'utente tocca un preferito.
  const [showListItems, setShowListItems] = useState<Track[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<ShowListResponse>("/playlists/show-list")
      .then((data) => {
        if (!cancelled) setShowListItems(data.items);
      })
      .catch(() => {
        // Show list non disponibile: si riparte senza di lei.
        if (!cancelled) setShowListItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePlay = (track: Track) => {
    if (favorites.length === 0) return;
    // Se il preferito non è in show list, metterlo in testa: altrimenti
    // `queueIndex = 0` evidenzierebbe un brano diverso da quello in play.
    const inShowList = showListItems.some((t) => t.id === track.id);
    const queue = inShowList
      ? showListItems
      : [track, ...showListItems];
    usePlayerStore.getState().playTrack(track, queue, "show-list");
    navigate("/player");
  };

  return (
    <AppShell
      activeTab="favorites"
      onTabChange={onTabChange}
      hasNotifications={unread > 0}
    >
      <h1 className="text-3xl font-bold tracking-tight">USER FAVORITES</h1>

      {isLoading && favorites.length === 0 && <LoadingView />}

      {error && favorites.length === 0 && (
        <div className="mt-8">
          <EmptyState
            variant="error"
            title="Errore"
            message={error}
            action={{ label: "Riprova", onClick: () => void fetchFavorites() }}
          />
        </div>
      )}

      {!isLoading && !error && favorites.length === 0 && (
        <div className="mt-8">
          <EmptyState
            variant="empty"
            title="Nessun preferito"
            message="Tocca il cuore su un brano per aggiungerlo ai preferiti."
          />
        </div>
      )}

      {favorites.length > 0 && (
        <ul className="mt-6 flex flex-col gap-6">
          {favorites.map((track) => (
            <li key={track.id}>
              <TrackListItem
                track={track}
                onPlay={handlePlay}
              />
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
