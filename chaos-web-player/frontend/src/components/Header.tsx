// Chaos Radio — Header riusato in tutte le pagine
// Mostra logo rotante + titolo + indicatore "on air".
// Nota: il logout è gestibile solo via API (POST /api/auth/logout).

import LogoMark from "./LogoMark";

interface HeaderProps {
  className?: string;
}

export default function Header({ className = "" }: HeaderProps) {
  return (
    <header
      className={`flex shrink-0 items-center justify-between border-b border-white/10 bg-chaos-black px-4 pb-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)] sm:px-6 ${className}`}
    >
      <div className="flex items-center gap-3">
        <LogoMark size={36} />
        <span className="text-lg font-bold tracking-tight sm:text-xl">
          CHAOS RADIO
        </span>
      </div>

      <div
        className="flex items-center gap-2 text-sm font-medium"
        style={{ color: "#FF5A1F" }}
        aria-label="In onda"
      >
        <span
          className="h-2 w-2 animate-pulse rounded-full"
          style={{ backgroundColor: "#FF5A1F" }}
        />
        <span>on air</span>
      </div>
    </header>
  );
}