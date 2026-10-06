// Stub App — popolato in Fase 4 con React Router, AppShell e AudioEngine
import { useEffect, useState } from "react";

export default function App() {
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setStatus(`${d.status} @ ${new Date(d.timestamp).toLocaleTimeString()}`))
      .catch(() => setStatus("offline"));
  }, []);

  return (
    <div className="flex h-full items-center justify-center bg-chaos-black p-6 text-center">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-accent">CHAOS RADIO</h1>
        <p className="mt-3 text-sm text-white/60">
          Frontend Fase 3 setup completato.
        </p>
        <p className="mt-1 text-sm text-white/40">Backend: {status}</p>
        <p className="mt-6 text-xs text-white/30">
          Le pagine (Player, Playlist, Favorites, Pirate Day, Notifiche) verranno implementate in Fase 4–5.
        </p>
      </div>
    </div>
  );
}