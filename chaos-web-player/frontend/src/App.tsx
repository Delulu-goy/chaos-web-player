// Chaos Radio — App entry
// Setup: Router v7, AuthProvider (ProtectedRoute), AudioEngine singleton, Notifier.

import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "./store/authStore";
import { useNotificationsStore } from "./store/notificationsStore";
import { useAudioEngine } from "./audio/useAudioEngine";
import ProtectedRoute from "./components/ProtectedRoute";

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
 * Carica le notifiche dell'utente loggato. Polling leggero ogni 60s.
 * Refetch on focus per catturare nuove notifiche tornando sull'app.
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

  return <>{children}</>;
}