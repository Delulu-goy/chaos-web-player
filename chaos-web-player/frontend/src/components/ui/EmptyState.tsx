// Chaos Radio — EmptyState per liste vuote / nessun risultato / errore soft
// Supporta 3 varianti: empty (neutro), error (rosso/arancio), info (informativo).
// Icona SVG opzionale.

import { Inbox, AlertTriangle, Info, type LucideIcon } from "lucide-react";

export type EmptyStateVariant = "empty" | "error" | "info";

interface EmptyStateProps {
  title?: string;
  message?: string;
  variant?: EmptyStateVariant;
  /** Icona custom; se omessa usa un'icona di default in base alla variant. */
  icon?: LucideIcon;
  /** Azione opzionale: bottone CTA in fondo. */
  action?: {
    label: string;
    onClick: () => void;
  };
}

const DEFAULT_ICONS: Record<EmptyStateVariant, LucideIcon> = {
  empty: Inbox,
  error: AlertTriangle,
  info: Info,
};

const VARIANT_TITLES: Record<EmptyStateVariant, string> = {
  empty: "Niente qui",
  error: "Errore",
  info: "Info",
};

export default function EmptyState({
  title,
  message = "Non c'è ancora nulla da mostrare.",
  variant = "empty",
  icon,
  action,
}: EmptyStateProps) {
  const Icon = icon ?? DEFAULT_ICONS[variant];
  const finalTitle = title ?? VARIANT_TITLES[variant];
  const iconColor =
    variant === "error" ? "#FF5A1F" : "rgba(255,255,255,0.35)";

  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-16 text-center"
      role={variant === "error" ? "alert" : undefined}
    >
      <Icon size={36} aria-hidden="true" style={{ color: iconColor }} />
      <p
        className="text-base font-bold"
        style={{ color: variant === "error" ? "#FF5A1F" : "rgba(255,255,255,0.7)" }}
      >
        {finalTitle}
      </p>
      <p className="max-w-xs text-sm text-white/40">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-2 border-2 px-4 py-2 text-xs font-bold uppercase tracking-wider transition-opacity hover:opacity-80"
          style={{ borderColor: "#FF5A1F", color: "#FF5A1F" }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}