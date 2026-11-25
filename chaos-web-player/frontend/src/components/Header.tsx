// Chaos Radio — Header riusato in tutte le pagine protette.
// Mostra logo rotante + titolo + username dell'utente attivo con il pallino
// "on air" lampeggiante + link di logout che riporta alla pagina di login.
//
// Layout a UNA sola riga (come negli screenshot di riferimento):
//   sx → logo + "CHAOS RADIO", allineati verticalmente e centrati nella fascia
//   dx → colonna: username + pallino sopra, logout (link piccolo) sotto
//
// Il pallino sta a destra dell'username dentro il gruppo allineato a destra:
// resta sempre ancorato al bordo destro dell'header, quindi non si sposta
// al variare della lunghezza dello username (che viene troncato).
//
// Nota: l'header resta a riga unica di proposito. Con il logout su una riga
// separata la fascia si allungava e il logo smetteva di essere centrato
// verticalmente: tornava al bordo superiore con un vuoto in basso a sinistra.

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
      className={`flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-chaos-black px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+1rem)] sm:px-6 ${className}`}
    >
      <div className="flex shrink-0 items-center gap-3">
        <LogoMark size={36} />
        <span className="text-lg font-bold tracking-tight sm:text-xl">
          CHAOS RADIO
        </span>
      </div>

      {username && (
        <div className="flex min-w-0 flex-col items-end gap-0.5">
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

          <button
            type="button"
            onClick={handleLogout}
            className="text-xs underline underline-offset-2 text-white/40 transition-colors hover:text-white/80 focus:outline-none focus-visible:text-white"
          >
            logout
          </button>
        </div>
      )}
    </header>
  );
}
