// Chaos Radio — Scanner della cartella audio
//
// Legge ricorsivamente tutti i *.mp3 sotto MUSIC_DIR, estrae i tag ID3
// (title/artist/year/genre/duration) + cover art embedded tramite
// `music-metadata`, e sincronizza la tabella `tracks` del DB:
//
//  - UPSERT per ogni MP3 trovato (idempotente: riesecuzioni successive
//    aggiornano tag aggiornati senza duplicare righe).
//  - DELETE per ogni track presente in DB ma non più su disco.
//  - DELETE + unlink della cover associata.
//
// Uso:
//   node --experimental-strip-types scripts/scan.js
//   # in cron:
//   */5 * * * * cd /home/.../backend && node --experimental-strip-types scripts/scan.js >> logs/scan.log 2>&1
//
// Env vars (tutte opzionali, con default sensati):
//   MUSIC_DIR  - default: "<cwd>/private/audio"
//   COVERS_DIR - default: "<cwd>/private/covers"
//   SCAN_BATCH_SIZE - default: 20 (file processati in parallelo per batch)
//
// Le credenziali DB sono lette da backend/.env (DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseFile } from "music-metadata";
import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import {
  loadEnv,
  optionalEnv,
  resolveDir,
  timestamp,
  ensureInside,
} from "./_shared.mjs";

loadEnv();

const MUSIC_DIR = resolveDir(
  "MUSIC_DIR",
  path.resolve(process.cwd(), "private/audio"),
);
const COVERS_DIR = resolveDir(
  "COVERS_DIR",
  path.resolve(process.cwd(), "private/covers"),
);
const BATCH_SIZE = Math.max(
  1,
  parseInt(optionalEnv("SCAN_BATCH_SIZE", "20"), 10) || 20,
);

function makePrisma() {
  const adapter = new PrismaMariaDb({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: parseInt(process.env.DB_PORT ?? "3306", 10),
    user: process.env.DB_USER ?? "chaos_app",
    password: process.env.DB_PASSWORD ?? "devpass",
    database: process.env.DB_NAME ?? "chaos_radio",
  });
  return new PrismaClient({ adapter, log: ["warn", "error"] });
}

const prisma = makePrisma();

/**
 * Hash deterministico del path audio → nome file sicuro per la cover.
 * Nessun carattere "strano" nel nome, niente path traversal.
 */
function coverPathFor(audioPath) {
  const hash = crypto
    .createHash("sha256")
    .update(audioPath)
    .digest("hex")
    .slice(0, 16);
  return path.join(COVERS_DIR, `cover-${hash}.jpg`);
}

/**
 * Estrae (e salva su disco) la prima immagine embedded nei tag ID3.
 * Ritorna il path assoluto della cover salvata, o null se assente.
 */
async function writeCover(meta, audioPath) {
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

  const coverPath = coverPathFor(audioPath);
  // Difesa in profondità: coverPath deve stare dentro COVERS_DIR.
  ensureInside(COVERS_DIR, coverPath);
  fs.writeFileSync(coverPath, buf);
  return coverPath;
}

/**
 * Scansiona un singolo file MP3 e ritorna i dati pronti per l'upsert.
 * Ritorna null in caso di errore di lettura/tag corrotti (skip).
 */
async function scanOne(filePath) {
  let meta;
  try {
    // skipCovers: false → estrae anche le picture (servono per la cover).
    // duration: true → legge il formato (richiesto per progress bar player).
    meta = await parseFile(filePath, { duration: true, skipCovers: false });
  } catch (err) {
    console.warn(
      `[scan]   skip ${path.basename(filePath)}: ${err.message ?? err}`,
    );
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
    coverPath = await writeCover(meta, filePath);
  } catch (err) {
    console.warn(
      `[scan]   ⚠ cover extract failed for ${path.basename(filePath)}: ${
        err.message ?? err
      }`,
    );
  }

  return { filePath, title, artist, year, genres, durationSeconds, coverPath };
}

/**
 * UPSERT in blocco (idempotente: su riesecuzione non duplica).
 */
async function upsertTrack(data) {
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
function walkMp3(root) {
  const results = [];
  const seen = new Set();

  function visit(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      console.warn(`[scan] ⚠ non riesco a leggere ${dir}: ${err.message}`);
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
 * Rimuove cover orfane (file .jpg in COVERS_DIR non più referenziati da nessun track).
 * Best-effort: errori di unlink sono ignorati.
 */
async function cleanOrphanCovers(usedCoverSet) {
  let removed = 0;
  let entries;
  try {
    entries = fs.readdirSync(COVERS_DIR, { withFileTypes: true });
  } catch (err) {
    console.warn(`[scan] ⚠ non riesco a leggere COVERS_DIR: ${err.message}`);
    return 0;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith("cover-")) continue;
    const full = path.join(COVERS_DIR, entry.name);
    if (!usedCoverSet.has(full)) {
      try {
        fs.unlinkSync(full);
        removed++;
      } catch {
        /* best-effort */
      }
    }
  }
  return removed;
}

async function main() {
  console.log(`[scan] start ${timestamp()}`);
  console.log(`[scan] MUSIC_DIR=${MUSIC_DIR}`);
  console.log(`[scan] COVERS_DIR=${COVERS_DIR}`);

  if (!fs.existsSync(MUSIC_DIR)) {
    console.warn(`[scan] ⚠ MUSIC_DIR non esiste, creo cartella vuota`);
    fs.mkdirSync(MUSIC_DIR, { recursive: true });
  }

  const audioFiles = walkMp3(MUSIC_DIR);
  console.log(`[scan] trovati ${audioFiles.length} file .mp3`);

  // ── 1. Parse + UPSERT in batch ──────────────────────────────────────
  let upserted = 0;
  let skipped = 0;
  for (let i = 0; i < audioFiles.length; i += BATCH_SIZE) {
    const batch = audioFiles.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(scanOne));
    for (const r of results) {
      if (!r) {
        skipped++;
        continue;
      }
      try {
        await upsertTrack(r);
        upserted++;
      } catch (err) {
        skipped++;
        console.error(
          `[scan]   ✗ upsert failed for ${path.basename(r.filePath)}: ${
            err.message ?? err
          }`,
        );
      }
    }
  }
  console.log(`[scan] upserted=${upserted}, skipped=${skipped}`);

  // ── 2. DELETE tracks orfani (non più su disco) ──────────────────────
  const dbRows = await prisma.track.findMany({
    select: { id: true, filePath: true, coverPath: true },
  });
  const filesystemSet = new Set(audioFiles);
  const orphans = dbRows.filter((t) => !filesystemSet.has(t.filePath));
  let deletedTracks = 0;
  for (const orphan of orphans) {
    try {
      await prisma.track.delete({ where: { id: orphan.id } });
      deletedTracks++;
      // Rimuovi cover associata se presente (verrà poi ri-pulita da cleanOrphanCovers)
      if (orphan.coverPath && fs.existsSync(orphan.coverPath)) {
        try {
          fs.unlinkSync(orphan.coverPath);
        } catch {
          /* best-effort */
        }
      }
    } catch (err) {
      console.warn(
        `[scan] ⚠ cannot delete orphan id=${orphan.id} (${orphan.filePath}): ${
          err.message ?? err
        }`,
      );
    }
  }
  if (deletedTracks > 0) {
    console.log(`[scan] rimosso ${deletedTracks} track orfani`);
  }

  // ── 3. Cleanup cover non più referenziate ──────────────────────────
  const remainingCovers = await prisma.track.findMany({
    select: { coverPath: true },
    where: { coverPath: { not: null } },
  });
  const usedCoverSet = new Set(remainingCovers.map((t) => t.coverPath));
  const removedCovers = await cleanOrphanCovers(usedCoverSet);
  if (removedCovers > 0) {
    console.log(`[scan] rimosso ${removedCovers} cover orfane`);
  }

  console.log(`[scan] ✓ done ${timestamp()}`);
}

main()
  .catch((err) => {
    console.error(`[scan] FATAL`, err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } catch {
      /* already disconnected */
    }
  });
