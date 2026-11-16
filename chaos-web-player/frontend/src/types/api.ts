// Chaos Radio — Shared API types
// Risppecchiano i model Prisma del backend (vedi backend/README.md →
// "Endpoint API" → "Contratto Track").

export type ID = number;

export interface User {
  id: ID;
  email: string;
  displayName: string | null;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
}

export interface Track {
  id: ID;
  filePath: string;
  title: string;
  artist: string;
  year: number | null;
  genres: string[] | null;
  durationSeconds: number | null;
  coverPath: string | null;
  addedAt: string;
  /**
   * False se il brano NON è preferitabile (brani del Pirate Day,
   * invariante I3). Il backend lo calcola con lo stesso predicato del
   * guard 403 di POST /api/favorites: la UI non può quindi mostrare un
   * cuore che il server rifiuterebbe.
   *
   * `undefined` = preferitabile (payload di un backend non aggiornato:
   * in quel caso valgono le regole contestuali, es. la lista Pirate Day).
   */
  favoriteable?: boolean;
}

export interface ShowListResponse {
  title: string;
  items: Track[];
}

export interface CuratorLinks {
  spotify?: string;
  youtube?: string;
  soundcloud?: string;
  instagram?: string;
}

export interface Curator {
  name: string | null;
  role: string | null;
  avatar: string | null;
  links: CuratorLinks | null;
}

export interface PirateDayResponse {
  title: string;
  curator: Curator;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  items: Track[];
}

export interface NotificationItem {
  id: ID;
  body: string;
  createdAt: string;
  read: boolean;
}

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "rate_limited"
  | "internal"
  | "unknown_error";