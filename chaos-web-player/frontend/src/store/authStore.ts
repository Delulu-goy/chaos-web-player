// Chaos Radio — Auth store (Zustand)
// Gestisce: user loggato, login, register, logout, hydrate.

import { create } from "zustand";
import { api, ApiError } from "../lib/api";
import type { AuthResponse, User } from "../types/api";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

// Promise cache: garantisce una sola chiamata /auth/me anche se più
// componenti montano in contemporanea (es. App + ProtectedRoute).
let hydrateInFlight: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  hydrate: async () => {
    // Deduplica: più componenti chiamano hydrate() al boot.
    // Se un'invocazione è già in corso, riusa la sua promise.
    if (hydrateInFlight) return hydrateInFlight;

    set({ isLoading: true });
    hydrateInFlight = (async () => {
      try {
        const { user } = await api.get<AuthResponse>("/auth/me");
        set({ user, isLoading: false, isInitialized: true });
      } catch (err) {
        // 401 (nessuna sessione) e 429 (rate limit) sono entrambi stati
        // "non loggato" dal punto di vista utente: nessun errore visibile.
        const isExpected =
          err instanceof ApiError && (err.status === 401 || err.status === 429);
        set({
          user: null,
          isLoading: false,
          isInitialized: true,
          error: isExpected ? null : "Impossibile verificare la sessione",
        });
      } finally {
        hydrateInFlight = null;
      }
    })();

    return hydrateInFlight;
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { user } = await api.post<AuthResponse>("/auth/login", {
        email,
        password,
      });
      set({ user, isLoading: false });
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 401
          ? "Credenziali non valide"
          : err instanceof ApiError && err.status === 429
            ? "Troppi tentativi, riprova più tardi"
            : "Errore di login";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  register: async (email, password, displayName) => {
    set({ isLoading: true, error: null });
    try {
      const { user } = await api.post<AuthResponse>("/auth/register", {
        email,
        password,
        displayName,
      });
      set({ user, isLoading: false });
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 409
          ? "Email già registrata"
          : err instanceof ApiError && err.code === "validation"
            ? "Controlla i campi inseriti"
            : "Errore di registrazione";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // ignora: stiamo facendo logout, qualunque errore va ignorato
    } finally {
      set({ user: null, error: null });
    }
  },

  clearError: () => set({ error: null }),
}));