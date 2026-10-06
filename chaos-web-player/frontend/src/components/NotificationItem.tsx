// Chaos Radio — NotificationItem
// Riga con data, pallino letto/non-letto, body Lorem.

import { formatDate } from "../lib/format";
import type { NotificationItem as NotificationItemType } from "../types/api";

interface NotificationItemProps {
  notification: NotificationItemType;
  onRead?: (id: number) => void;
}

export default function NotificationItem({
  notification,
  onRead,
}: NotificationItemProps) {
  const { id, body, createdAt, read } = notification;

  const handleClick = () => {
    if (!read) onRead?.(id);
  };

  return (
    <button
      onClick={handleClick}
      disabled={read}
      className="block w-full border-b border-white/10 py-6 text-left transition-opacity disabled:opacity-60 hover:enabled:opacity-80"
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
        {formatDate(createdAt)}
      </div>
      <p
        className="mt-3 leading-relaxed"
        style={{ color: read ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.7)" }}
      >
        {body}
      </p>
    </button>
  );
}