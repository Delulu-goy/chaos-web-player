// Chaos Radio — AppShell: layout principale con Header (opzionale), contenuto scrollabile, BottomNav.
// Usato dalle pagine protette dopo il login.

import type { ReactNode } from "react";
import Header from "./Header";
import BottomNav, { type TabKey } from "./BottomNav";

interface AppShellProps {
  children: ReactNode;
  activeTab: TabKey;
  onTabChange: (key: TabKey) => void;
  hasNotifications?: boolean;
  showHeader?: boolean;
}

export default function AppShell({
  children,
  activeTab,
  onTabChange,
  hasNotifications = false,
  showHeader = true,
}: AppShellProps) {
  return (
    <div className="flex h-screen w-full flex-col bg-black font-mono text-white">
      {showHeader && <Header />}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-md flex-col px-4 pb-6 pt-6 sm:max-w-lg sm:px-6">
          {children}
        </div>
      </main>
      <BottomNav
        activeTab={activeTab}
        onTabChange={onTabChange}
        hasNotifications={hasNotifications}
      />
    </div>
  );
}