// Chaos Radio — LoadingView riusato in tutte le pagine protette
// Wrapper che mostra uno Spinner centrato verticalmente dentro un AppShell-like layout.

import Spinner from "./Spinner";

interface LoadingViewProps {
  /** Messaggio accessibile (default "Caricamento…") */
  label?: string;
  /** Distanza dal top in classi Tailwind (default py-20) */
  padding?: string;
}

/**
 * Vista di caricamento consistente. Da usare nelle pagine durante fetch iniziale
 * per evitare di duplicare `<div className="flex justify-center py-20"><Spinner /></div>`.
 */
export default function LoadingView({
  label = "Caricamento…",
  padding = "py-20",
}: LoadingViewProps) {
  return (
    <div className={`flex justify-center ${padding}`}>
      <span className="sr-only">{label}</span>
      <Spinner />
    </div>
  );
}