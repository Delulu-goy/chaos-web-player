// Chaos Radio — ProtectedRoute
// Mostra children solo se l'utente è autenticato, altrimenti redirect a /login.

import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import Spinner from "./ui/Spinner";

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isInitialized, isLoading, hydrate } = useAuthStore();
  const location = useLocation();

  // Al primo mount assicurati che /me sia stato chiamato
  useEffect(() => {
    if (!isInitialized && !isLoading) {
      hydrate();
    }
  }, [isInitialized, isLoading, hydrate]);

  // Mostra spinner finché non sappiamo se l'utente è loggato
  if (!isInitialized || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}