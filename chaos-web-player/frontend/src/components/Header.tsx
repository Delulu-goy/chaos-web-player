// Chaos Radio — Header riusato in tutte le pagine
// Mostra logo rotante + titolo + indicatore "on air" + menu utente (logout).

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import LogoMark from "./LogoMark";
import { useAuthStore } from "../store/authStore";

interface HeaderProps {
  className?: string;
}

export default function Header({ className = "" }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  // Chiudi menu contestuale al click fuori
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <header
      className={`flex shrink-0 items-center justify-between border-b border-white/10 bg-black px-4 pb-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)] sm:px-6 ${className}`}
    >
      <div className="flex items-center gap-3">
        <LogoMark size={36} />
        <span className="text-lg font-bold tracking-tight sm:text-xl">
          CHAOS RADIO
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* Indicatore "on air" */}
        <div
          className="flex items-center gap-2 text-sm"
          style={{ color: "#FF5A1F" }}
          aria-label="In onda"
        >
          <span
            className="h-2 w-2 animate-pulse rounded-full"
            style={{ backgroundColor: "#FF5A1F" }}
          />
          <span className="hidden sm:inline">on air</span>
        </div>

        {/* Menu utente: logout */}
        {user && (
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menu utente"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="rounded p-2 text-white/60 transition-colors hover:bg-white/5 hover:text-white"
            >
              <LogOut size={18} aria-hidden="true" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-40 mt-2 min-w-[160px] rounded-md border border-white/10 bg-neutral-950 py-1 shadow-lg"
              >
                <div className="border-b border-white/5 px-3 py-2 text-xs text-white/40">
                  {user.email}
                </div>
                <button
                  role="menuitem"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-white/90 transition-colors hover:bg-white/5"
                >
                  <LogOut size={16} aria-hidden="true" />
                  Esci
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}