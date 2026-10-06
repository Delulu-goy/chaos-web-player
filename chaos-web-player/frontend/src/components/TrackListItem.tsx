// Chaos Radio — TrackListItem
// Riga riusata in Playlist, Favorites, Pirate Day.
// Mostra: cover quadrata, titolo, artista, anno, cuore favorite.

import FavoriteButton from "./FavoriteButton";
import type { Track } from "../types/api";

interface TrackListItemProps {
  track: Track;
  initialLiked?: boolean;
  onPlay?: (track: Track) => void;
}

export default function TrackListItem({
  track,
  initialLiked = false,
  onPlay,
}: TrackListItemProps) {
  const coverUrl = track.coverPath
    ? `${(import.meta.env.VITE_API_URL as string | undefined) ?? "/api"}/tracks/${track.id}/cover`
    : null;

  return (
    <div className="flex items-center gap-4">
      {/* Cover (placeholder se non disponibile) */}
      <button
        onClick={() => onPlay?.(track)}
        aria-label={`Play ${track.title}`}
        className="h-14 w-14 shrink-0 overflow-hidden rounded-sm bg-neutral-800 transition-opacity hover:opacity-80 sm:h-16 sm:w-16"
      >
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : null}
      </button>

      {/* Title / Artist / Year */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{track.title}</p>
        <p className="truncate text-sm" style={{ color: "#FF5A1F" }}>
          {track.artist}
        </p>
        {track.year && (
          <p className="text-xs text-white/40">{track.year}</p>
        )}
      </div>

      {/* Favorite button */}
      <FavoriteButton
        trackId={track.id}
        initialLiked={initialLiked}
      />
    </div>
  );
}