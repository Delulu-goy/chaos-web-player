// Chaos Radio — FavoriteButton (cuore toggle per i preferiti)
//
// Lo stato NON è locale: si legge e si scrive in useFavoritesStore, che è
// l'unica fonte di verità. Così il cuore ha lo stesso aspetto in tutte le
// pagine (player, playlist, preferiti, pirate day) e resta allineato dopo
// un remount o un cambio di tab.
//
// Nota: il bottone riceve il Track completo (non solo l'id) perché lo store
// deve poter inserire il brano nella lista dei preferiti all'ottimistica.

import { Heart } from "lucide-react";
import { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { useFavoritesStore } from "../store/favoritesStore";
import type { Track } from "../types/api";

interface FavoriteButtonProps {
  track: Track;
  size?: number;
}

export default function FavoriteButton({ track, size = 20 }: FavoriteButtonProps) {
  const user = useAuthStore((s) => s.user);
  const liked = useFavoritesStore((s) => s.favoriteIds.has(track.id));
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const [busy, setBusy] = useState(false);

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || busy) return;

    setBusy(true);
    try {
      await toggleFavorite(track);
    } catch {
      // Rollback e toast sono già gestiti dallo store.
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={toggle}
      aria-label={liked ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
      aria-pressed={liked}
      disabled={!user || busy}
      className="shrink-0 transition-opacity hover:opacity-80 disabled:opacity-40"
      style={{ color: "#FF5A1F" }}
    >
      <Heart size={size} fill={liked ? "#FF5A1F" : "none"} />
    </button>
  );
}
