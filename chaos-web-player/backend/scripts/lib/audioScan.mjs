// Chaos Radio — Libreria di scansione audio (condivisa da scan.js e pirate-day.js)
//
// È il cuore di `scan.js` estratto in una libreria: `scan.js` scansiona
// tutta la libreria (MUSIC_DIR), `pirate-day.js` scansiona i brani di una
// singola edizione (i file elencati nel manifest). Usando lo STESSO
// codice, cover e waveform sono identiche a prima e non c'è duplicazione.
//
// API pubblicata:
//   makeLogger(prefix)                             → logger "[prefix] ..."
//   coverPathFor(audioPath, coversDir)              → path della cover
//   writeCover(meta, audioPath, coversDir, logger) → path cover o null
//   scanOne(filePath, opts)                        → dati per l'upsert | null
//   upsertTrack(prisma, data)                      → riga `tracks`
//   walkMp3(root, logger)                          → lista di file .mp3
//   scanDirectory(prisma, opts)                    → { upserted, skipped, files }

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseFile } from "music-metadata";
import { ensureInside } from "../_shared.mjs";

/**
 * Logger con prefisso: `[scan] ...`, `[pirate-day] ...`.
 * I messaggi passati qui NON includono il prefisso.
 */
export function makeLogger(prefix = "scan") {
  return {
    log: (msg) => console.log(`[${prefix}] ${msg}`),
    warn: (msg) => console.warn(`[${prefix}] ${msg}`),
  };
}

/** Logger di default (usato se il chiamante non ne passa uno). */
const DEFAULT_LOGGER = makeLogger("scan");

/**
 * Hash deterministico del path audio → nome file sicuro per la cover.
 * Nessun carattere "strano" nel nome, niente path traversal.
 */
export function coverPathFor(audioPath, coversDir) {
  const hash = crypto
    .createHash("sha256")
    .update(audioPath)
    .digest("hex")
    .slice(0, 16);
  return path.join(coversDir, `cover-${hash}.jpg`);
}

/**
 * Estrae (e salva su disco) la prima immagine embedded nei tag ID3.
 * Ritorna il path assoluto della cover salvata, o null se assente.
 */
export async function writeCover(meta, audioPath, coversDir, logger = DEFAULT_LOGGER) {
  const pictures = meta.common.picture;
  if (!Array.isArray(pictures) || pictures.length === 0) return null;
  const pic = pictures[0];
  if (!pic || !pic.data) return null;

  // music-metadata v12 restituisce Uint8Array (o Buffer a seconda dei casi).
  // Normalizziamo a Buffer per fs.writeFileSync.
  const buf = Buffer.isBuffer(pic.data)
    ? pic.data
    : Buffer.from(pic.data);

  // Verifica formato base (JPEG magic bytes). Se non è un JPEG (PNG/etc),
  // restituiamo null: il frontend accetta solo image/jpeg.
  if (
    buf.length < 4 ||
    buf[0] !== 0xff ||
    buf[1] !== 0xd8 ||
    buf[2] !== 0xff
  ) {
    return null;
  }

  // Cap ragionevole: 5 MB. Copertine più grandi sono sospette.
  if (buf.length > 5 * 1024 * 1024) {
    return null;
  }

  const coverPath = coverPathFor(audioPath, coversDir);
  // Difesa in profondità: coverPath deve stare dentro COVERS_DIR.
  ensureInside(coversDir, coverPath);
  fs.writeFileSync(coverPath, buf);
  return coverPath;
}

/**
 * Scansiona un singolo file MP3 e ritorna i dati pronti per l'upsert.
 * Ritorna null in caso di errore di lettura/tag corrotti (skip).
 */
export async function scanOne(filePath, { coversDir, logger = DEFAULT_LOGGER } = {}) {
  let meta;
  try {
    // skipCovers: false → estrae anche le picture (servono per la cover).
    // duration: true → legge il formato (richiesto per progress bar player).
    meta = await parseFile(filePath, { duration: true, skipCovers: false });
  } catch (err) {
    logger.warn(`  skip ${path.basename(filePath)}: ${err.message ?? err}`);
    return null;
  }

  const baseName = path.basename(filePath, path.extname(filePath));
  const title = (meta.common.title ?? "").trim() || baseName;
  const artist =
    (meta.common.artist ?? "").trim() ||
    (meta.common.albumartist ?? "").trim() ||
    "Unknown Artist";
  const year =
    typeof meta.common.year === "number" && Number.isFinite(meta.common.year)
      ? meta.common.year
      : null;
  const genres =
    Array.isArray(meta.common.genre) && meta.common.genre.length > 0
      ? meta.common.genre
      : null;
  const durationSeconds =
    typeof meta.format.duration === "number" &&
    Number.isFinite(meta.format.duration)
      ? Math.max(0, Math.round(meta.format.duration))
      : null;

  let coverPath = null;
  try {
    coverPath = await writeCover(meta, filePath, coversDir, logger);
  } catch (err) {
    logger.warn(
      `  ⚠ cover extract failed for ${path.basename(filePath)}: ${
        err.message ?? err
      }`,
    );
  }

  return { filePath, title, artist, year, genres, durationSeconds, coverPath };
}

/**
 * UPSERT in blocco (idempotente: su riesecuzione non duplica).
 */
export async function upsertTrack(prisma, data) {
  return prisma.track.upsert({
    where: { filePath: data.filePath },
    create: data,
    update: {
      title: data.title,
      artist: data.artist,
      year: data.year,
      genres: data.genres,
      durationSeconds: data.durationSeconds,
      coverPath: data.coverPath,
    },
  });
}

/**
 * Trova ricorsivamente tutti i file *.mp3 dentro root, evitando symlink loop.
 */
export function walkMp3(root, logger = DEFAULT_LOGGER) {
  const results = [];
  const seen = new Set();

  function visit(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      logger.warn(`⚠ non riesco a leggere ${dir}: ${err.message}`);
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        // Evita loop: salta symlink (potrebbero essere attaccati a /etc)
        continue;
      }
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        // Evita di scendere in cartelle che sono link simbolici risolti
        const real = fs.realpathSync(full);
        if (seen.has(real)) continue;
        seen.add(real);
        visit(full);
      } else if (stat.isFile() && entry.name.toLowerCase().endsWith(".mp3")) {
        results.push(full);
      }
    }
  }

  visit(root);
  return results;
}

/**
 * Scansiona una directory e fa l'upsert dei brani trovati.
 *
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {object} opts
 * @param {string} opts.root directory da scansionare
 * @param {string} opts.coversDir directory delle cover
 * @param {number} [opts.batchSize] file processati in parallelo per batch
 * @param {object} [opts.logger]
 * @param {string[]} [opts.files] lista di file già nota (evita una seconda
 *   scansione della directory quando il chiamante ha già fatto il walk)
 * @returns {Promise<{upserted: number, skipped: number, files: string[]}>}
 */
export async function scanDirectory(
  prisma,
  { root, coversDir, batchSize = 20, logger = DEFAULT_LOGGER, files },
) {
  const list = Array.isArray(files) ? files : walkMp3(root, logger);

  let upserted = 0;
  let skipped = 0;
  for (let i = 0; i < list.length; i += batchSize) {
    const batch = list.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((f) => scanOne(f, { coversDir, logger })),
    );
    for (const r of results) {
      if (!r) {
        skipped++;
        continue;
      }
      try {
        await upsertTrack(prisma, r);
        upserted++;
      } catch (err) {
        skipped++;
        logger.warn(
          `  ✗ upsert failed for ${path.basename(r.filePath)}: ${
            err.message ?? err
          }`,
        );
      }
    }
  }

  return { upserted, skipped, files: list };
}
