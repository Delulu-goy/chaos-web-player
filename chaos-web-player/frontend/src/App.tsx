// Chaos Radio — App entry
// Setup: Router v7, AuthProvider (ProtectedRoute), AudioEngine singleton, Notifier.

import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "./store/authStore";
import { useNotificationsStore } from "./store/notificationsStore";
import { useFavoritesStore } from "./store/favoritesStore";
import { useAudioEngine } from "./audio/useAudioEngine";
import { toast } from "./store/toastStore";
import ProtectedRoute from "./components/ProtectedRoute";
import ToastHost from "./components/ui/ToastHost";

import LoginPage from "./features/auth/LoginPage";
import RegisterPage from "./features/auth/RegisterPage";
import PlayerPage from "./features/player/PlayerPage";
import PlaylistPage from "./features/playlist/PlaylistPage";
import FavoritesPage from "./features/favorites/FavoritesPage";
import PirateDayPage from "./features/pirate-day/PirateDayPage";
import NotificationsPage from "./features/notifications/NotificationsPage";
import NotFoundPage from "./features/NotFoundPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthBootstrap>
        <AudioEngineMount>
          <NotifierMount>
            <FavoritesMount>
              <Routes>
                {/* Public */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />

                {/* Protected */}
                <Route
                  path="/player"
                  element={
                    <ProtectedRoute>
                      <PlayerPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/playlist"
                  element={
                    <ProtectedRoute>
                      <PlaylistPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/favorites"
                  element={
                    <ProtectedRoute>
                      <FavoritesPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/pirate-day"
                  element={
                    <ProtectedRoute>
                      <PirateDayPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/notifications"
                  element={
                    <ProtectedRoute>
                      <NotificationsPage />
                    </ProtectedRoute>
                  }
                />

                {/* Default → player (auth guard farà redirect a /login) */}
                <Route path="/" element={<Navigate to="/player" replace />} />

                {/* 404 */}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
              <ToastHost />
            </FavoritesMount>
          </NotifierMount>
        </AudioEngineMount>
      </AuthBootstrap>
    </BrowserRouter>
  );
}

/**
 * Al primo mount dell'app: chiama /api/auth/me per verificare la sessione.
 * Se risponde 401, user resta null e ProtectedRoute reindirizza al login.
 */
function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate);
  const isInitialized = useAuthStore((s) => s.isInitialized);

  useEffect(() => {
    if (!isInitialized) {
      hydrate();
    }
  }, [hydrate, isInitialized]);

  return <>{children}</>;
}

/**
 * Monta il singleton HTMLAudioElement in tutta l'app (fuori dalle route)
 * così la riproduzione non si interrompe al cambio tab.
 */
function AudioEngineMount({ children }: { children: React.ReactNode }) {
  useAudioEngine();
  return <>{children}</>;
}

/**
 * Carica i preferiti dell'utente loggato, una volta sola al login.
 *
 * I preferiti sono dati cross-page: il player, la playlist e i preferiti
 * mostrano gli stessi cuori, quindi il caricamento non può stare in una
 * singola pagina (il player non ha una sua pagina "preferiti" da cui
 * partire). Lo store `favoritesStore` è l'unica fonte di verità e questa
 * wrapper lo tiene allineato con la sessione: fetch al login, reset al logout.
 */
function FavoritesMount({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const fetchFavorites = useFavoritesStore((s) => s.fetch);
  const resetFavorites = useFavoritesStore((s) => s.reset);

  useEffect(() => {
    if (user) {
      void fetchFavorites();
    } else {
      resetFavorites();
    }
  }, [user, fetchFavorites, resetFavorites]);

  // Refetch quando l'utente torna sull'app (visibility/focus).
  //
  // Serve a far sparire i brani cancellati durante la sessione (invariante
  // I4): alla scadenza di un'edizione pirate day i file vengono rimossi e
  // i track spariscono dal DB con cascade sui preferiti. Senza il refetch
  // il cuore resterebbe lì fino al prossimo reload.
  useEffect(() => {
    if (!user) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void fetchFavorites();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [user, fetchFavorites]);

  return <>{children}</>;
}

/**
 * Carica le notifiche dell'utente loggato. Polling leggero ogni 60s.
 * Refetch on focus per catturare nuove notifiche tornando sull'app.
 * Monitora anche lo stato online/offline per dare feedback immediato via toast.
 */
function NotifierMount({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const fetchNotifications = useNotificationsStore((s) => s.fetch);
  const location = useLocation();

  // Fetch iniziale al login
  useEffect(() => {
    if (user) {
      fetchNotifications();
    }
  }, [user, fetchNotifications]);

  // Refetch quando l'utente torna sull'app (visibility/focus)
  useEffect(() => {
    if (!user) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        fetchNotifications();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [user, fetchNotifications, location.pathname]);

  // Network status: toast quando si torna online o si va offline
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => toast.success("Connessione ripristinata.");
    const onOffline = () => toast.error("Connessione persa. Operazioni offline.");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return <>{children}</>;
}