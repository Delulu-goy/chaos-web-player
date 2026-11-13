// Chaos Radio — TrackListItem
// Riga riusata in Playlist, Favorites, Pirate Day.
// Mostra: cover quadrata, titolo, artista, anno, cuore favorite.
// Quando `highlightPlaying` è true (PlayerPage queue + PlaylistPage),
// la riga del brano attualmente in play riceve bg-chaos-trackActive.
//
// Area di click: tutta la riga è cliccabile per riprodurre il brano, non
// solo la cover. Si usa il pattern dello "stretched button": la cover resta
// l'unico <button> (un solo tab stop, accessibilità corretta) e un overlay
// posizionato in modo assoluto rispetto alla RIGA ne estende l'area
// cliccabile a tutta la larghezza, gap compresi.
// Tre dettagli necessari:
//  1. `overflow-hidden` sta sullo <span> interno, non sul bottone: se fosse
//     sul bottone, l'overlay verrebbe ritagliato alla 56x56 della cover.
//  2. Il bottone resta position: static, così l'overlay si riferisce alla
//     riga (position: relative) e non al bottone.
//  3. Il cuore ha z-10: l'overlay, essendo posizionato, si dipingerebbe
//     sopra e ruberebbe i click.

import FavoriteButton from "./FavoriteButton";
import { usePlayerStore } from "../store/playerStore";
import { trackCoverUrl } from "../lib/media";
import type { Track } from "../types/api";

interface TrackListItemProps {
  track: Track;
  onPlay?: (track: Track) => void;
  /** Se true, evidenzia la riga del brano attualmente in play. */
  highlightPlaying?: boolean;
  /**
   * Se false, il cuore dei preferiti non viene renderizzato.
   * Default true. La tab Pirate Day passa false: i brani del pirate day
   * non sono preferitabili (invariante I3).
   */
  showFavorite?: boolean;
}

export default function TrackListItem({
  track,
  onPlay,
  highlightPlaying = false,
  showFavorite = true,
}: TrackListItemProps) {
  const coverUrl = track.coverPath
    ? trackCoverUrl(track.id)
    : null;

  // Selettore che ritorna un booleano stabile: solo re-render della riga
  // interessata quando lo stato cambia, niente cascade sulle altre.
  const isCurrentPlaying = usePlayerStore((s) =>
    s.isPlaying && s.currentTrack?.id === track.id,
  );

  const active = highlightPlaying && isCurrentPlaying;

  return (
    <div
      className="group relative flex cursor-pointer items-center gap-4 rounded-sm"
      style={
        active
          ? { backgroundImage: "linear-gradient(to right, #191b1c 0%, #141516 100%)" }
          : undefined
      }
      aria-current={active ? "true" : undefined}
    >
      {/* Cover = bottone "play". L'overlay interno estende l'area cliccabile
          del bottone a tutta la riga (è posizionato rispetto alla riga,
          non al bottone, perché il bottone resta position: static). */}
      <button
        type="button"
        onClick={() => onPlay?.(track)}
        aria-label={`Play ${track.title}`}
        className="h-14 w-14 shrink-0 rounded-sm bg-neutral-800 transition-opacity group-hover:opacity-80 sm:h-16 sm:w-16"
      >
        {coverUrl ? (
          <span className="block h-full w-full overflow-hidden rounded-sm">
            <img
              src={coverUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          </span>
        ) : null}
        <span className="absolute inset-0" aria-hidden="true" />
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

      {/* Favorite button — z-10 per restare sopra l'overlay */}
      {showFavorite ? (
        <span className="relative z-10">
          <FavoriteButton track={track} />
        </span>
      ) : null}
    </div>
  );
}
