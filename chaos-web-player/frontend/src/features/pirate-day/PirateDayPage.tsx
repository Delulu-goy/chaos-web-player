// Chaos Radio — PirateDayPage (stub)

import { useNavigate } from "react-router-dom";
import AppShell from "../../components/AppShell";
import type { TabKey } from "../../components/BottomNav";
import { useNotificationsStore } from "../../store/notificationsStore";

export default function PirateDayPage() {
  const navigate = useNavigate();
  const unread = useNotificationsStore((s) => s.unreadCount());
  const onTabChange = (k: TabKey) => navigate(`/${k}`);

  return (
    <AppShell
      activeTab="pirate-day"
      onTabChange={onTabChange}
      hasNotifications={unread > 0}
    >
      <h1 className="text-2xl font-bold tracking-tight">PIRATE DAY #23</h1>
      <p className="mt-4 text-sm text-white/40">
        Curator + playlist — implementazione in Fase 5.
      </p>
    </AppShell>
  );
}