// Chaos Radio — TrackListItem
// Riga riusata in Playlist, Favorites, Pirate Day.
// Mostra: cover quadrata, titolo, artista, anno, cuore favorite.
// Quando `highlightPlaying` è true (PlayerPage queue + PlaylistPage),
// la riga del brano attualmente in play riceve bg-chaos-trackActive.

import clsx from "clsx";
import FavoriteButton from "./FavoriteButton";
import { usePlayerStore } from "../store/playerStore";
import type { Track } from "../types/api";

interface TrackListItemProps {
  track: Track;
  initialLiked?: boolean;
  onPlay?: (track: Track) => void;
  /** Se true, evidenzia la riga del brano attualmente in play. */
  highlightPlaying?: boolean;
}

export default function TrackListItem({
  track,
  initialLiked = false,
  onPlay,
  highlightPlaying = false,
}: TrackListItemProps) {
  const coverUrl = track.coverPath
    ? `${(import.meta.env.VITE_API_URL as string | undefined) ?? "/api"}/tracks/${track.id}/cover`
    : null;

  // Selettore che ritorna un booleano stabile: solo re-render della riga
  // interessata quando lo stato cambia, niente cascade sulle altre.
  const isCurrentPlaying = usePlayerStore((s) =>
    s.isPlaying && s.currentTrack?.id === track.id,
  );

  const active = highlightPlaying && isCurrentPlaying;

  return (
    <div
      className={clsx(
        "flex items-center gap-4 rounded-sm",
        active && "bg-chaos-trackActive",
      )}
      aria-current={active ? "true" : undefined}
    >
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
