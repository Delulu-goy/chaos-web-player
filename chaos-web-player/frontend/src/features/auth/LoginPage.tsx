// Chaos Radio — LoginPage
// Login con email/password. Redirect a `from` (o /player) dopo successo.

import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import LogoMark from "../../components/LogoMark";
import Spinner from "../../components/ui/Spinner";

interface LocationState {
  from?: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from ?? "/player";

  const { login, isLoading, error, clearError, user } = useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Se l'utente è già loggato, redirect immediato
  if (user) {
    navigate(from, { replace: true });
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch {
      // errore già impostato nello store
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-6 font-mono text-white">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center gap-3">
          <LogoMark size={56} />
          <h1 className="text-2xl font-bold tracking-tight">CHAOS RADIO</h1>
          <p className="text-sm text-white/40">Accedi per continuare</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-white/60">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) clearError();
              }}
              className="border border-white/10 bg-black px-4 py-3 text-base outline-none transition-colors focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-white/60">Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) clearError();
              }}
              className="border border-white/10 bg-black px-4 py-3 text-base outline-none transition-colors focus:border-accent"
            />
          </label>

          {error && (
            <p className="text-sm" style={{ color: "#FF5A1F" }} role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading || !email || !password}
            className="mt-2 flex items-center justify-center gap-2 border-2 py-3 text-sm font-bold uppercase tracking-wider transition-opacity disabled:opacity-50"
            style={{ borderColor: "#FF5A1F", color: "#FF5A1F" }}
          >
            {isLoading ? <Spinner /> : "Entra"}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-white/40">
          Non hai un account?{" "}
          <Link
            to="/register"
            className="underline transition-opacity hover:opacity-80"
            style={{ color: "#FF5A1F" }}
          >
            Registrati
          </Link>
        </p>
      </div>
    </div>
  );
}