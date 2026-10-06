// Chaos Radio — Formatters

/**
 * Formatta secondi in MM:SS o HH:MM:SS se >= 1h.
 * Esempi: 90 → "01:30", 3661 → "1:01:01"
 */
export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");

  if (h > 0) {
    return `${h}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

/**
 * Formatta una data ISO in "DD/MM/YY" stile UI.
 */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

/**
 * Formatta una differenza di tempo come countdown "Xh.Ym left" / "Xm left" / "Xs left".
 * Se expiresAt è nel passato ritorna "Ended".
 */
export function formatCountdown(expiresAt: string): string {
  const target = new Date(expiresAt).getTime();
  const now = Date.now();
  const diffMs = target - now;

  if (diffMs <= 0) return "Ended";

  const totalSec = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m left`;
  return `${s}s left`;
}