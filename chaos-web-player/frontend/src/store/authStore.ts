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

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  hydrate: async () => {
    set({ isLoading: true });
    try {
      const { user } = await api.get<AuthResponse>("/auth/me");
      set({ user, isLoading: false, isInitialized: true });
    } catch (err) {
      // 401 è atteso quando non c'è sessione: è uno stato normale, non errore
      if (err instanceof ApiError && err.status === 401) {
        set({ user: null, isLoading: false, isInitialized: true, error: null });
      } else {
        set({
          user: null,
          isLoading: false,
          isInitialized: true,
          error: "Impossibile verificare la sessione",
        });
      }
    }
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