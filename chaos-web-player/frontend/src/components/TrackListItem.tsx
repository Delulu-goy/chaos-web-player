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
   *
   * Nota: è un override per LISTA (nasconde il cuore a tutto ciò che è
   * nella lista). Per nasconderlo in base al BRANO c'è il flag
   * `track.favoriteable` del server: si applica comunque e in più.
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

  // Il cuore compare solo se: la lista lo permette E il brano è
  // preferitabile (flag del server: brani Pirate Day → no cuore).
  const heartVisible = showFavorite && track.favoriteable !== false;

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
        className="h-16 w-16 shrink-0 rounded-sm bg-neutral-800 transition-opacity group-hover:opacity-80"
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
        <p className="truncate" style={{ color: "#FF5A1F" }}>
          {track.artist}
        </p>
        {track.year && (
          <p className="text-sm text-white/40">{track.year}</p>
        )}
      </div>

      {/* Favorite button — z-10 per restare sopra l'overlay.
          Non renderizzato per i brani non preferitabili (Pirate Day). */}
      {heartVisible ? (
        <span className="relative z-10">
          <FavoriteButton track={track} />
        </span>
      ) : null}
    </div>
  );
}
