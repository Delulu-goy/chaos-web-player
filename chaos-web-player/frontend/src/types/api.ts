// Chaos Radio — Shared API types
// Risppecchiano i model Prisma del backend (vedi plans/chaos-radio-player.md §5).

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