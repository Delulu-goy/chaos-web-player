// Chaos Radio — NotificationsPage
// Titolo "UPDATES" — storico delle notifiche, ordinato per data e ora
// (dal più recente al più vecchio).
//
// Le notifiche NON spariscono: restano in lista e si distinguono per lo
// stato letto (non lette in evidenza, lette in grigio).
//
// Il solo fatto di visitare questa pagina marca come lette tutte le
// notifiche visibili (POST /api/notifications/read-all): non serve
// cliccare nessuna notifica.

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../../components/AppShell";
import type { TabKey } from "../../components/BottomNav";
import LoadingView from "../../components/ui/LoadingView";
import EmptyState from "../../components/ui/EmptyState";
import NotificationItem from "../../components/NotificationItem";
import { useNotificationsStore } from "../../store/notificationsStore";

export default function NotificationsPage() {
  const navigate = useNavigate();
  const onTabChange = (k: TabKey) => navigate(`/${k}`);

  const items = useNotificationsStore((s) => s.items);
  const isLoading = useNotificationsStore((s) => s.isLoading);
  const error = useNotificationsStore((s) => s.error);
  const hasMore = useNotificationsStore((s) => s.hasMore);
  const unread = useNotificationsStore((s) => s.unreadCount);
  const fetchNotifications = useNotificationsStore((s) => s.fetch);
  const loadMore = useNotificationsStore((s) => s.loadMore);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);

  // Fetch ad ogni mount della pagina (utile per refresh manuale)
  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  // Visita della pagina ⇒ tutte le notifiche visibili diventano lette.
  // Nessun update ottimistico: al caricamento successivo risultano
  // grigie (è il comportamento richiesto).
  useEffect(() => {
    void markAllRead();
  }, [markAllRead]);

  return (
    <AppShell
      activeTab="notifications"
      onTabChange={onTabChange}
      hasNotifications={unread > 0}
    >
      <h1 className="text-3xl font-bold tracking-tight">UPDATES</h1>

      {isLoading && items.length === 0 && <LoadingView />}

      {error && items.length === 0 && (
        <div className="mt-8">
          <EmptyState
            variant="error"
            title="Errore"
            message={error}
            action={{ label: "Riprova", onClick: () => void fetchNotifications() }}
          />
        </div>
      )}

      {!isLoading && !error && items.length === 0 && (
        <div className="mt-8">
          <EmptyState
            variant="info"
            title="Nessuna notifica"
            message="Non ci sono aggiornamenti al momento."
          />
        </div>
      )}

      {items.length > 0 && (
        <ul className="mt-2 flex flex-col">
          {items.map((n) => (
            <li key={n.id}>
              <NotificationItem notification={n} />
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            className="border border-white/20 px-4 py-2 text-xs tracking-widest transition-opacity hover:opacity-70"
          >
            CARICA ALTRE
          </button>
        </div>
      )}
    </AppShell>
  );
}
