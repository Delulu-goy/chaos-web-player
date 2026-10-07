// Chaos Radio — NotificationsPage (stub)

import { useNavigate } from "react-router-dom";
import AppShell from "../../components/AppShell";
import type { TabKey } from "../../components/BottomNav";

export default function NotificationsPage() {
  const navigate = useNavigate();
  const onTabChange = (k: TabKey) => navigate(`/${k}`);

  return (
    <AppShell activeTab="notifications" onTabChange={onTabChange}>
      <h1 className="text-2xl font-bold tracking-tight">UPDATES</h1>
      <p className="mt-4 text-sm text-white/40">
        Notifiche — implementazione in Fase 5.
      </p>
    </AppShell>
  );
}