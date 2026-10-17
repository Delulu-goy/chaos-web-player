// Chaos Radio — AppShell: layout principale con Header, contenuto scrollabile, BottomNav.
// Usato dalle pagine protette dopo il login.
//
// Layout: flex-col a tutta altezza viewport. Header e BottomNav sono flex siblings
// di <main> che ha overflow-y-auto → Header e BottomNav restano fissi mentre solo
// il contenuto centrale scrolla. `overflow-hidden` sul root previene scroll-bounce
// della pagina intera in iOS PWA standalone.

import type { ReactNode } from "react";
import Header from "./Header";
import BottomNav, { type TabKey } from "./BottomNav";

interface AppShellProps {
  children: ReactNode;
  activeTab: TabKey;
  onTabChange: (key: TabKey) => void;
  hasNotifications?: boolean;
}

export default function AppShell({
  children,
  activeTab,
  onTabChange,
  hasNotifications = false,
}: AppShellProps) {
  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-black font-mono text-white">
      <Header />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-md flex-col px-4 pb-content-safe pt-6 sm:max-w-lg sm:px-6">
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