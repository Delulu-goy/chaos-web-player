// Chaos Radio — Percorsi condivisi fra API e script CLI
//
// La cartella del Pirate Day sta dentro MUSIC_DIR (V1/V2 del piano):
// fuori, `scan.js` la tratterebbe come track orfani e cancellerebbe i
// brani ogni 5 minuti, e le waveform non verrebbero mai calcolate.
//
// La risoluzione è uguale in API e script: `process.cwd()` come base,
// env var che può essere assoluta o relativa. Così il backend in
// produzione (cwd = backend/) e gli script CLI parlano della stessa
// cartella.

import path from "node:path";

/** Valore di default della cartella del Pirate Day (relativo alla cwd). */
export const PIRATE_DAY_DIR_DEFAULT = "private/audio/pirate-day";

/**
 * Cartella del Pirate Day.
 * @returns {string} path assoluto
 */
export function pirateDayDir() {
  const raw = process.env.PIRATE_DAY_DIR || PIRATE_DAY_DIR_DEFAULT;
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

/**
 * Verifica se un path è dentro una directory.
 *
 * Non usa `startsWith`: "/private/audio/pirate-day2" NON è dentro
 * "/private/audio/pirate-day" (il prefisso di stringa è più corto ma
 * sufficiente a far scivolare un file estraneo nella cartella).
 * `path.relative` è l'unico confronto sicuro.
 *
 * @param {string} root directory radice
 * @param {string} candidate path da verificare
 * @returns {boolean}
 */
export function isPathInside(root, candidate) {
  if (!root || !candidate) return false;
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  if (rel === "") return true;
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}
