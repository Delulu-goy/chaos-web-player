// Chaos Radio — FavoriteButton (cuore toggle per i preferiti)

import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { toast } from "../store/toastStore";

interface FavoriteButtonProps {
  trackId: number;
  initialLiked?: boolean;
  size?: number;
}

export default function FavoriteButton({
  trackId,
  initialLiked = false,
  size = 20,
}: FavoriteButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [busy, setBusy] = useState(false);
  const user = useAuthStore((s) => s.user);

  // Se l'utente cambia (login/logout), reset
  useEffect(() => {
    setLiked(initialLiked);
  }, [initialLiked, user?.id]);

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || busy) return;

    const next = !liked;
    setLiked(next); // optimistic
    setBusy(true);

    try {
      if (next) {
        await api.post(`/favorites/${trackId}`);
      } else {
        await api.delete(`/favorites/${trackId}`);
      }
    } catch (err) {
      setLiked(!next); // rollback
      if (err instanceof ApiError) {
        toast.error("Impossibile aggiornare i preferiti. Riprova.");
        console.warn(`Favorite[${trackId}] toggle failed:`, err.code);
      }
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