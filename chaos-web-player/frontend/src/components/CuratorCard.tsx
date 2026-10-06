// Chaos Radio — CuratorCard (profilo del curatore in Pirate Day)

import { Music, PlayCircle, Cloud, Camera } from "lucide-react";
import type { Curator, CuratorLinks } from "../types/api";

// lucide-react non include icone brand (Spotify/YT/IG):
// usiamo icone generiche equivalenti per il visual
const ICONS = {
  spotify: Music,
  youtube: PlayCircle,
  soundcloud: Cloud,
  instagram: Camera,
} as const;

interface CuratorCardProps {
  curator: Curator;
}

export default function CuratorCard({ curator }: CuratorCardProps) {
  if (!curator.name) return null;

  const links: CuratorLinks = curator.links ?? {};
  const linkEntries = (
    Object.entries(links).filter(([, url]) => Boolean(url)) as Array<
      [keyof CuratorLinks, string]
    >
  );

  return (
    <div className="border-t border-white/10 pt-6">
      <div className="flex items-center gap-2 text-sm text-white/40">
        <span className="inline-block h-3 w-3 rounded-full bg-white/60" />
        GUEST CURATOR
      </div>

      <div className="mt-4 flex items-center gap-4">
        {/* Avatar */}
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-neutral-800">
          {curator.avatar ? (
            <img
              src={curator.avatar}
              alt={curator.name}
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>

        {/* Name + role */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{curator.name}</p>
          {curator.role && (
            <p className="truncate text-sm text-white/60">{curator.role}</p>
          )}
        </div>

        {/* Social links */}
        {linkEntries.length > 0 && (
          <div className="flex shrink-0 items-center gap-3">
            {linkEntries.map(([platform, url]) => {
              const Icon = ICONS[platform];
              return (
                <a
                  key={platform}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${curator.name} su ${platform}`}
                  className="text-white/80 transition-opacity hover:opacity-60"
                >
                  <Icon size={20} />
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}