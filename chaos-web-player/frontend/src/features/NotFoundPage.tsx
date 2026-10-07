// Chaos Radio — NotFoundPage (404)

import { Link } from "react-router-dom";
import LogoMark from "../components/LogoMark";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-6 text-center font-mono text-white">
      <LogoMark size={64} />
      <h1 className="mt-6 text-3xl font-bold tracking-tight">404</h1>
      <p className="mt-2 text-sm text-white/40">Pagina non trovata</p>
      <Link
        to="/player"
        className="mt-6 text-sm underline"
        style={{ color: "#FF5A1F" }}
      >
        Torna al player
      </Link>
    </div>
  );
}