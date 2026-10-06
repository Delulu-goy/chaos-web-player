// Chaos Radio — Header riusato in tutte le pagine (eccetto player)
// Mostra logo, titolo, indicatore "on air"

import LogoMark from "./LogoMark";

interface HeaderProps {
  className?: string;
}

export default function Header({ className = "" }: HeaderProps) {
  return (
    <header
      className={`flex shrink-0 items-center justify-between border-b border-white/10 bg-black px-4 py-4 sm:px-6 ${className}`}
    >
      <div className="flex items-center gap-3">
        <LogoMark size={36} />
        <span className="text-lg font-bold tracking-tight sm:text-xl">
          CHAOS RADIO
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm" style={{ color: "#FF5A1F" }}>
        <span
          className="h-2 w-2 animate-pulse rounded-full"
          style={{ backgroundColor: "#FF5A1F" }}
        />
        on air
      </div>
    </header>
  );
}