// Chaos Radio — Spinner riusato in loading state

export default function Spinner() {
  return (
    <div
      className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-[#FF5A1F]"
      role="status"
      aria-label="Caricamento"
    />
  );
}