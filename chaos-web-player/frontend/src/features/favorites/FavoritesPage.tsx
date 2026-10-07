// Chaos Radio — FavoritesPage (stub)

import { useNavigate } from "react-router-dom";
import AppShell from "../../components/AppShell";
import type { TabKey } from "../../components/BottomNav";
import { useNotificationsStore } from "../../store/notificationsStore";

export default function FavoritesPage() {
  const navigate = useNavigate();
  const unread = useNotificationsStore((s) => s.unreadCount());
  const onTabChange = (k: TabKey) => navigate(`/${k}`);

  return (
    <AppShell
      activeTab="favorites"
      onTabChange={onTabChange}
      hasNotifications={unread > 0}
    >
      <h1 className="text-2xl font-bold tracking-tight">USER FAVORITES</h1>
      <p className="mt-4 text-sm text-white/40">
        Brani preferiti — implementazione in Fase 5.
      </p>
    </AppShell>
  );
}