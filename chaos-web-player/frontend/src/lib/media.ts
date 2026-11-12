// Chaos Radio — URL builder centralizzato
//
// Unico punto in cui si decide come costruire gli URL verso il backend.
// Prima la base era ricalcolata (identica) in quattro file: api.ts,
// useAudioEngine.ts, PlayerPage.tsx e TrackListItem.tsx.
//
// VITE_API_URL è opzionale:
//   - in sviluppo Vite fa da proxy su /api, quindi si usa il path relativo
//   - in produzione il backend è sullo stesso dominio (rewrite .htaccess),
//     quindi /api relativo funziona senza configurazione
//
// ATTENZIONE: in Vite `.env.local` ha PRIORITÀ su `.env.production`. Se
// `.env.local` contiene un URL assoluto (es. http://localhost:3001/api),
// la build di produzione punta a localhost. Lasciare entrambi vuoti.

export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

/** URL dello stream audio autenticato di una traccia. */
export function trackStreamUrl(trackId: number): string {
  return `${API_BASE}/tracks/${trackId}/stream`;
}

/** URL della cover di una traccia (null se la traccia non ha coverPath). */
export function trackCoverUrl(trackId: number): string {
  return `${API_BASE}/tracks/${trackId}/cover`;
}
