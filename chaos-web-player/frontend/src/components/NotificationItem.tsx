// Chaos Radio — NotificationItem
// Riga di una notifica: data e ora, pallino letto/non-letto, titolo e body.
//
// La notifica NON è cliccabile: lo stato "letto" dipende solo dalla
// visita alla pagina notifiche (vedi `markAllRead` nello store).

import { formatDateTime } from "../lib/format";
import { renderRichText } from "../lib/richText";
import type {
  NotificationItem as NotificationItemType,
  NotificationKind,
} from "../types/api";

/** Etichetta leggibile per l'origine della notifica. */
const KIND_LABEL: Record<NotificationKind, string | null> = {
  NEW_TRACKS: "NUOVI BRANI",
  PIRATE_DAY: "PIRATE DAY",
  CUSTOM: null,
};

interface NotificationItemProps {
  notification: NotificationItemType;
}

export default function NotificationItem({ notification }: NotificationItemProps) {
  const { title, body, kind, createdAt, read } = notification;
  const kindLabel = KIND_LABEL[kind] ?? null;

  return (
    <article
      className="block w-full border-b border-white/10 py-6 text-left"
      style={{ opacity: read ? 0.6 : 1 }}
    >
      <div
        className="flex items-center gap-3 text-sm font-bold"
        style={{ color: read ? "rgba(255,255,255,0.4)" : "#FF5A1F" }}
      >
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{
            backgroundColor: read ? "rgba(255,255,255,0.4)" : "#FF5A1F",
          }}
        />
        {formatDateTime(createdAt)}
        {kindLabel && (
          <span
            className="border border-current px-2 py-0.5 text-[10px] tracking-widest"
            style={{ color: read ? "rgba(255,255,255,0.4)" : "#FF5A1F" }}
          >
            {kindLabel}
          </span>
        )}
      </div>

      {title && (
        <h2
          className="mt-3 text-base font-bold"
          style={{ color: read ? "rgba(255,255,255,0.4)" : "#ffffff" }}
        >
          {title}
        </h2>
      )}

      <p
        className="mt-3 leading-relaxed"
        style={{ color: read ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.7)" }}
      >
        {renderRichText(body)}
      </p>
    </article>
  );
}
