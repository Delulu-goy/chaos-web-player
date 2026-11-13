// Chaos Radio — Normalizzazione dei link del curatore
//
// Il frontend (`CuratorCard`) si aspetta un OGGETTO `{spotify: url, ...}`.
// Il vecchio seed scriveva un ARRAY `[{type, url}]`: con quel formato
// `ICONS["0"]` era `undefined` e il render crashava.
//
// Qui il formato viene convertito una volta sola (idempotente): gli array
// legacy diventano oggetti, le piattaforme sconosciute vengono scartate.

/** Piattaforme social supportate dal frontend (stesso set di CuratorCard). */
export const CURATOR_PLATFORMS = ["spotify", "youtube", "soundcloud", "instagram"];

/**
 * @param {unknown} links valore grezzo dal DB o dal manifest
 * @returns {Record<string,string>|null} oggetto `{piattaforma: url}` o null
 */
export function normalizeCuratorLinks(links) {
  if (!links || typeof links !== "object") return null;

  if (Array.isArray(links)) {
    const out = {};
    for (const entry of links) {
      if (!entry || typeof entry !== "object") continue;
      const platform = String(entry.platform ?? entry.type ?? "")
        .trim()
        .toLowerCase();
      const url = typeof entry.url === "string" ? entry.url.trim() : "";
      if (url && CURATOR_PLATFORMS.includes(platform)) out[platform] = url;
    }
    return Object.keys(out).length > 0 ? out : null;
  }

  const out = {};
  for (const platform of CURATOR_PLATFORMS) {
    const url = links[platform];
    if (typeof url === "string" && url.trim()) out[platform] = url.trim();
  }
  return Object.keys(out).length > 0 ? out : null;
}
