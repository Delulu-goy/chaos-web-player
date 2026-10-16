// Chaos Radio — NotificationsPage
// Titolo "UPDATES" — lista delle notifiche dell'utente.
// Click su una notifica non letta → POST /api/notifications/:id/read (optimistic).
// Riusa useNotificationsStore (fetch + markRead con optimistic update + rollback).

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../../components/AppShell";
import type { TabKey } from "../../components/BottomNav";
import Spinner from "../../components/ui/Spinner";
import EmptyState from "../../components/ui/EmptyState";
import NotificationItem from "../../components/NotificationItem";
import { useNotificationsStore } from "../../store/notificationsStore";

export default function NotificationsPage() {
  const navigate = useNavigate();
  const onTabChange = (k: TabKey) => navigate(`/${k}`);

  const items = useNotificationsStore((s) => s.items);
  const isLoading = useNotificationsStore((s) => s.isLoading);
  const error = useNotificationsStore((s) => s.error);
  const fetchNotifications = useNotificationsStore((s) => s.fetch);
  const markRead = useNotificationsStore((s) => s.markRead);

  // Fetch ad ogni mount della pagina (utile per refresh manuale)
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  return (
    <AppShell activeTab="notifications" onTabChange={onTabChange}>
      <h1 className="text-3xl font-bold tracking-tight">UPDATES</h1>

      {isLoading && items.length === 0 && (
        <div className="mt-8 flex justify-center">
          <Spinner />
        </div>
      )}

      {error && items.length === 0 && (
        <div className="mt-8">
          <EmptyState
            title="Errore"
            message={error}
          />
        </div>
      )}

      {!isLoading && !error && items.length === 0 && (
        <div className="mt-8">
          <EmptyState
            title="Nessuna notifica"
            message="Non ci sono aggiornamenti al momento."
          />
        </div>
      )}

      {items.length > 0 && (
        <ul className="mt-2 flex flex-col">
          {items.map((n) => (
            <li key={n.id}>
              <NotificationItem
                notification={n}
                onRead={(id) => {
                  void markRead(id);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}