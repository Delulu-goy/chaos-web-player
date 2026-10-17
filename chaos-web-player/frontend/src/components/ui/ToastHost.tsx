// Chaos Radio — ToastHost
// Renderizza la coda di toast come stack in fondo alla pagina, sopra la BottomNav.
// Include safe-area-inset per iOS notch. Auto-dismiss gestito dallo store.

import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { useToastStore, type Toast } from "../../store/toastStore";

const ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
} as const;

const COLORS = {
  success: { fg: "#000000", bg: "rgba(255, 90, 31, 0.95)", border: "#FF5A1F" },
  error: { fg: "#FFFFFF", bg: "rgba(40, 0, 0, 0.95)", border: "#FF5A1F" },
  info: { fg: "#FFFFFF", bg: "rgba(20, 20, 20, 0.95)", border: "rgba(255,255,255,0.2)" },
} as const;

interface ToastCardProps {
  toast: Toast;
  onDismiss: (id: number) => void;
}

function ToastCard({ toast: t, onDismiss }: ToastCardProps) {
  const Icon = ICONS[t.kind];
  const color = COLORS[t.kind];
  const role = t.kind === "error" ? "alert" : "status";

  return (
    <div
      role={role}
      aria-live={t.kind === "error" ? "assertive" : "polite"}
      className="pointer-events-auto flex max-w-sm items-start gap-3 rounded-md border px-4 py-3 shadow-lg backdrop-blur-sm"
      style={{
        backgroundColor: color.bg,
        borderColor: color.border,
        color: color.fg,
      }}
    >
      <Icon size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p className="flex-1 text-sm leading-snug">{t.message}</p>
      <button
        onClick={() => onDismiss(t.id)}
        aria-label="Chiudi notifica"
        className="-mr-1 -mt-1 shrink-0 rounded p-1 opacity-70 transition-opacity hover:opacity-100"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export default function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4"
      style={{
        // Sopra la BottomNav (~56px) + safe-area iOS
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)",
      }}
      aria-label="Notifiche"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  );
}