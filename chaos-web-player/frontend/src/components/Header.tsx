// Chaos Radio — Header riusato in tutte le pagine protette.
// Mostra logo rotante + titolo + username dell'utente attivo con il pallino
// "on air" lampeggiante + bottone di logout che riporta alla pagina di login.
//
// Layout a due righe:
//   riga 1 → logo + titolo (sx) | username + pallino (dx)
//   riga 2 → bottone logout (dx, allineato sotto l'username)
//
// Il pallino sta a destra dell'username dentro un gruppo allineato a destra:
// resta sempre ancorato al bordo destro dell'header, quindi non si sposta
// al variare della lunghezza dello username (che viene troncato).

import { useNavigate } from "react-router-dom";
import LogoMark from "./LogoMark";
import { useAuthStore } from "../store/authStore";

interface HeaderProps {
  className?: string;
}

export default function Header({ className = "" }: HeaderProps) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  // Username mostrato all'utente: displayName se impostato, altrimenti email.
  const username = user?.displayName || user?.email || "";

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <header
      className={`flex shrink-0 flex-col border-b border-white/10 bg-chaos-black px-4 pb-2 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] sm:px-6 ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex shrink-0 items-center gap-3">
          <LogoMark size={36} />
          <span className="text-lg font-bold tracking-tight sm:text-xl">
            CHAOS RADIO
          </span>
        </div>

        {username && (
          <div
            className="flex min-w-0 items-center gap-2 text-sm"
            style={{ color: "#FF5A1F" }}
            aria-label="In onda"
          >
            <span className="min-w-0 truncate max-w-[9rem] sm:max-w-[14rem]">
              {username}
            </span>
            <span
              className="h-2 w-2 shrink-0 animate-pulse rounded-full"
              style={{ backgroundColor: "#FF5A1F" }}
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      <div className="mt-1 flex justify-end">
        <button
          type="button"
          onClick={handleLogout}
          className="border border-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white/50 transition-colors hover:border-white/30 hover:text-white focus:outline-none focus-visible:border-white/40 focus-visible:text-white"
        >
          logout
        </button>
      </div>
    </header>
  );
}
