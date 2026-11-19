// Chaos Radio — Helper condivisi per le notifiche
//
// Usati sia dall'API (`routes/notifications.routes.js`) sia dagli script
// CLI (`scripts/scan.js`, `scripts/pirate-day.js`): la logica di creazione
// deve stare in un posto solo, altrimenti l'API e gli script divergono.
//
// Regole:
//  - `userId = null` → notifica broadcast (visibile a tutti gli utenti).
//  - `userId = <id>` → notifica target (solo quell'utente).
//  - `dedupeKey` rende la creazione idempotente: con la stessa chiave non
//    nasce una seconda notifica (usata per "una notifica per edizione
//    Pirate Day" e opzionalmente dalle notifiche custom).

/**
 * Crea una notifica.
 *
 * @param {import("../../generated/prisma/client.ts").PrismaClient} prisma
 * @param {object} opts
 * @param {string|null} [opts.title] intestazione sintetica
 * @param {string} opts.body testo della notifica
 * @param {"NEW_TRACKS"|"PIRATE_DAY"|"CUSTOM"} [opts.kind]
 * @param {number|null} [opts.userId] null = broadcast
 * @param {object|null} [opts.meta] dati strutturati (JSON)
 * @param {string|null} [opts.dedupeKey] chiave di idempotenza
 * @returns {Promise<{notification: object, created: boolean}>}
 */
export async function createNotification(
  prisma,
  {
    title = null,
    body,
    kind = "CUSTOM",
    userId = null,
    meta = null,
    dedupeKey = null,
  },
) {
  if (dedupeKey) {
    const existing = await prisma.notification.findUnique({
      where: { dedupeKey },
    });
    if (existing) return { notification: existing, created: false };
  }

  const notification = await prisma.notification.create({
    data: { title, body, kind, userId, meta, dedupeKey },
  });
  return { notification, created: true };
}

/**
 * Compone il riassunto testuale di una lista di brani.
 * @param {Array<{title: string, artist: string}>} tracks
 * @returns {string}
 */
export function formatTracksSummary(tracks) {
  const titles = tracks.map((t) => `${t.artist} — ${t.title}`);
  const preview = titles.slice(0, 4).join(", ");
  const more = titles.length > 4 ? ` e altri ${titles.length - 4}` : "";
  return `${preview}${more}`;
}

/**
 * Notifica broadcast: nuovi brani entrati nella show list.
 *
 * Una sola notifica per batch di scan (non una per brano): il testo
 * elenca i brani arrivati in quel giro.
 *
 * @param {import("../../generated/prisma/client.ts").PrismaClient} prisma
 * @param {Array<{id: number, title: string, artist: string}>} tracks
 */
export async function notifyNewTracks(prisma, tracks) {
  if (!Array.isArray(tracks) || tracks.length === 0) return null;

  const noun = tracks.length === 1 ? "nuovo brano" : "nuovi brani";
  const body = `${tracks.length} ${noun} in Show List: ${formatTracksSummary(tracks)}`;

  return createNotification(prisma, {
    title: "Nuovi brani in Show List",
    body,
    kind: "NEW_TRACKS",
    userId: null,
    meta: {
      count: tracks.length,
      tracks: tracks.map((t) => ({ id: t.id, title: t.title, artist: t.artist })),
    },
  });
}

/**
 * Notifica broadcast: nuova edizione Pirate Day in onda.
 *
 * Idempotente per edizione (`dedupeKey`): riaprire la finestra di
 * un'edizione già scaduta non crea una seconda notifica.
 *
 * @param {import("../../generated/prisma/client.ts").PrismaClient} prisma
 * @param {object} opts
 * @param {number} opts.edition numero dell'edizione
 * @param {string} [opts.slug] slug della playlist
 * @param {number} [opts.playlistId]
 * @param {Date|string|null} [opts.endsAt]
 */
export async function notifyPirateDay(
  prisma,
  { edition, slug = null, playlistId = null, endsAt = null },
) {
  const body = `Pirate Day #${edition} is on the air`;

  return createNotification(prisma, {
    title: `Pirate Day #${edition}`,
    body,
    kind: "PIRATE_DAY",
    userId: null,
    meta: {
      edition,
      slug,
      playlistId,
      endsAt: endsAt instanceof Date ? endsAt.toISOString() : endsAt,
    },
    dedupeKey: `pirate-day:${edition}`,
  });
}
