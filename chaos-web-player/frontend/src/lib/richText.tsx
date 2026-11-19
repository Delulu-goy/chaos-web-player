// Chaos Radio — Rendering minimale di testo con **highlight**
//
// Parser minimal: supporta **testo** (bold + arancione), il resto resta
// plain text. Usato dalle descrizioni Pirate Day e dal corpo delle
// notifiche (che usano la stessa sintassi markdown bold).

import type { ReactNode } from "react";

/**
 * Spezza il testo in parti, evidenziando i segmenti **bold**.
 * @param text testo da renderizzare
 * @returns frammenti React pronti da mettere in un <p>
 */
export function renderRichText(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(part);
    if (m) {
      return (
        <span key={i} className="font-bold" style={{ color: "#FF5A1F" }}>
          {m[1]}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
