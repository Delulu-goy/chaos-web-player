// Chaos Radio — Helper del Pirate Day lato API
//
// Due criteri di esclusione, usati insieme:
//
//  1. PER PATH — il brano è dentro `PIRATE_DAY_DIR` (la cartella dei file
//     dell'edizione).
//  2. PER DATI — il brano è referenziato da una playlist di kind
//     PIRATE_DAY (copre playlist_items inquinati a mano e resta valido
//     anche se la cartella cambia tra un deploy e l'altro).
//
// La show list deve rispettare entrambi (I1), i preferiti almeno il
// secondo (I3).

import prisma from "../db.js";
import { isPathInside, pirateDayDir } from "./paths.js";

/**
 * Insieme degli ID dei brani che appartengono a una playlist PIRATE_DAY.
 * @param {import("@prisma/client").PrismaClient} [client]
 * @returns {Promise<Set<number>>}
 */
export async function pirateDayTrackIds(client = prisma) {
  const rows = await client.playlistItem.findMany({
    where: { playlist: { kind: "PIRATE_DAY" } },
    select: { trackId: true },
  });
  return new Set(rows.map((r) => r.trackId));
}

/**
 * Il file del brano sta dentro la cartella del Pirate Day?
 * @param {string} filePath
 * @returns {boolean}
 */
export function isPirateDayPath(filePath) {
  if (!filePath) return false;
  return isPathInside(pirateDayDir(), filePath);
}

/**
 * Un brano è preferitabile? I brani del Pirate Day non lo sono (I3).
 *
 * UNICO predicato dell'intera app: viene usato sia per il flag
 * `favoriteable` dei DTO (così la UI non può mostrare un cuore che il
 * server rifiuta) sia per il guard 403 di POST /api/favorites/:id.
 * Se i due usassero criteri diversi, la UI potrebbe promettere un cuore
 * che il backend rifiuta: è esattamente il bug che questo predicato
 * unico elimina.
 *
 * Si usano entrambi i criteri (OR):
 *   - per DATI: il brano è referenziato da una playlist PIRATE_DAY;
 *   - per PATH: il file sta dentro PIRATE_DAY_DIR.
 *
 * Il criterio per PATH copre il caso in cui le righe playlist_items non
 * esistono ancora (edizione appena pubblicata, publish fallito a
 * metà): il brano è comunque dentro la cartella del Pirate Day e non
 * deve diventare un preferito.
 *
 * @param {{id: number, filePath: string}} track
 * @param {Set<number>} pirateDayIds ID dei brani in una playlist PIRATE_DAY
 * @returns {boolean}
 */
export function isFavoriteable(track, pirateDayIds) {
  if (!track) return false;
  if (pirateDayIds && pirateDayIds.has(track.id)) return false;
  if (isPirateDayPath(track.filePath)) return false;
  return true;
}

/**
 * DTO del brano: il record Prisma + il flag `favoriteable`.
 *
 * Il frontend usa il flag per NON renderizzare il cuore dei preferiti
 * sui brani non preferitabili (invariante I3).
 *
 * @param {object} track record Prisma (Track)
 * @param {Set<number>} pirateDayIds ID dei brani in una playlist PIRATE_DAY
 * @returns {object}
 */
export function toTrackDto(track, pirateDayIds) {
  return { ...track, favoriteable: isFavoriteable(track, pirateDayIds) };
}
