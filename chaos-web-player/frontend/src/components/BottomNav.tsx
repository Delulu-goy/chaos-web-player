// Chaos Radio — Bottom nav con 5 icone + badge notifiche

import {
  Play,
  Menu,
  Skull,
  User as User,
  Bell,
  type LucideIcon,
} from "lucide-react";

export type TabKey = "player" | "playlist" | "pirate-day" | "favorites" | "notifications";

const NAV_ITEMS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "player", label: "Player", icon: Play },
  { key: "playlist", label: "Playlist", icon: Menu },
  { key: "pirate-day", label: "Pirate Day", icon: Skull },
  { key: "favorites", label: "Preferiti", icon: User },
  { key: "notifications", label: "Notifiche", icon: Bell },
];

interface BottomNavProps {
  activeTab: TabKey;
  onTabChange: (key: TabKey) => void;
  hasNotifications?: boolean;
}

export default function BottomNav({
  activeTab,
  onTabChange,
  hasNotifications = false,
}: BottomNavProps) {
  return (
    <nav className="flex shrink-0 items-center justify-around border-t border-white/10 bg-black py-3">
      {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
        const isActive = key === activeTab;
        const showBadge = key === "notifications" && hasNotifications;
        return (
          <button
            key={key}
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onTabChange(key)}
            className="relative flex flex-col items-center justify-center p-2 transition-colors"
            style={{ color: isActive ? "#FF5A1F" : "rgba(255,255,255,0.85)" }}
          >
            <Icon
              size={24}
              fill={
                key === "player" && isActive ? "#FF5A1F" : "none"
              }
            />
            {showBadge && (
              <span
                className="absolute right-1 top-1 h-2 w-2 rounded-full bg-white"
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}