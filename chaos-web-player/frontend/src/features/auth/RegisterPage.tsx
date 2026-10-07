// Chaos Radio — RegisterPage
// Registrazione con email/password/displayName. Dopo successo → /player.

import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import LogoMark from "../../components/LogoMark";
import Spinner from "../../components/ui/Spinner";

const MIN_PASSWORD = 8;

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register, isLoading, error, clearError, user } = useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  if (user) {
    navigate("/player", { replace: true });
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    if (password.length < MIN_PASSWORD) {
      return;
    }
    try {
      await register(
        email,
        password,
        displayName.trim() || undefined,
      );
      navigate("/player", { replace: true });
    } catch {
      // errore già impostato nello store
    }
  };

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-6 font-mono text-white">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center gap-3">
          <LogoMark size={56} />
          <h1 className="text-2xl font-bold tracking-tight">CHAOS RADIO</h1>
          <p className="text-sm text-white/40">Crea un account</p>
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
            <span className="text-white/60">Display name (opzionale)</span>
            <input
              type="text"
              maxLength={80}
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="border border-white/10 bg-black px-4 py-3 text-base outline-none transition-colors focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-white/60">
              Password (min {MIN_PASSWORD} caratteri)
            </span>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) clearError();
              }}
              className="border border-white/10 bg-black px-4 py-3 text-base outline-none transition-colors focus:border-accent"
            />
            {passwordTooShort && (
              <span className="text-xs text-white/40">
                Ancora {MIN_PASSWORD - password.length} caratteri
              </span>
            )}
          </label>

          {error && (
            <p className="text-sm" style={{ color: "#FF5A1F" }} role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading || !email || passwordTooShort}
            className="mt-2 flex items-center justify-center gap-2 border-2 py-3 text-sm font-bold uppercase tracking-wider transition-opacity disabled:opacity-50"
            style={{ borderColor: "#FF5A1F", color: "#FF5A1F" }}
          >
            {isLoading ? <Spinner /> : "Registrati"}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-white/40">
          Hai già un account?{" "}
          <Link
            to="/login"
            className="underline transition-opacity hover:opacity-80"
            style={{ color: "#FF5A1F" }}
          >
            Accedi
          </Link>
        </p>
      </div>
    </div>
  );
}