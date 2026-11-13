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
 * Il brano appartiene a una playlist PIRATE_DAY?
 * @param {number} trackId
 * @param {import("@prisma/client").PrismaClient} [client]
 * @returns {Promise<boolean>}
 */
export async function isPirateDayTrack(trackId, client = prisma) {
  const item = await client.playlistItem.findFirst({
    where: { trackId, playlist: { kind: "PIRATE_DAY" } },
    select: { playlistId: true },
  });
  return item !== null;
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
