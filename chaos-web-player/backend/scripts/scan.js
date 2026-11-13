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
//  - Manutiene la playlist `show-list`: i `playlist_items` vengono
//    ricostruiti a ogni giro con i brani della libreria ESCLUSI quelli
//    sotto PIRATE_DAY_DIR (i brani del Pirate Day vivono solo nella
//    playlist dell'edizione, mai nella show list).
//
// Uso:
//   node --experimental-strip-types scripts/scan.js
//   # in cron:
//   */5 * * * * cd /home/.../backend && node --experimental-strip-types scripts/scan.js >> logs/scan.log 2>&1
//
// Env vars (tutte opzionali, con default sensati):
//   MUSIC_DIR  - default: "<cwd>/private/audio"
//   COVERS_DIR - default: "<cwd>/private/covers"
//   PIRATE_DAY_DIR - default: "<cwd>/private/audio/pirate-day" (escluso dalla show list)
//   SCAN_BATCH_SIZE - default: 20 (file processati in parallelo per batch)
//
// Le credenziali DB sono lette da backend/.env (DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME).

import fs from "node:fs";
import path from "node:path";
import {
  loadEnv,
  optionalEnv,
  resolveDir,
  timestamp,
  ensureInside,
} from "./_shared.mjs";
import { makePrisma } from "./lib/prisma.mjs";
import { computeWaveform, serializeWaveform } from "./lib/waveform.mjs";
import { waveformFileFor, waveformsDir } from "../src/lib/waveformStore.js";
import { isPathInside, pirateDayDir } from "../src/lib/paths.js";
import { makeLogger, scanDirectory, walkMp3 } from "./lib/audioScan.mjs";

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
// La cartella del Pirate Day: sta dentro MUSIC_DIR (V1/V2 del piano).
// I brani che contiene non finiscono nella show list.
const PIRATE_DAY_DIR = pirateDayDir();

const logger = makeLogger("scan");

const prisma = makePrisma();

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
    logger.warn(`⚠ non riesco a leggere COVERS_DIR: ${err.message}`);
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

/**
 * Mantiene la playlist `show-list` (slug "show-list", kind SHOW).
 *
 * I `playlist_items` vengono ricostruiti da zero a ogni giro:
 *   - solo i brani trovati nella scansione di MUSIC_DIR;
 *   - ESCLUSI quelli sotto PIRATE_DAY_DIR (I1: la show list non contiene
 *     mai brani del pirate day);
 *   - ordinati per `addedAt desc`, come la libreria storica (l'UX della
 *     show list non cambia).
 *
 * L'esclusione usa `path.relative` (isPathInside), non un `startsWith`
 * grezzo: "/private/audio/pirate-day-2" non è dentro
 * "/private/audio/pirate-day".
 */
async function maintainShowList(scannedFiles) {
  const playlist = await prisma.playlist.upsert({
    where: { slug: "show-list" },
    create: {
      slug: "show-list",
      title: "Show List",
      kind: "SHOW",
    },
    update: {
      title: "Show List",
      kind: "SHOW",
    },
  });

  const tracks = await prisma.track.findMany({
    select: { id: true, filePath: true, addedAt: true },
    orderBy: { addedAt: "desc" },
  });

  const scanned = new Set(scannedFiles);
  const showTracks = tracks.filter(
    (t) =>
      scanned.has(t.filePath) && !isPathInside(PIRATE_DAY_DIR, t.filePath),
  );

  const operations = [
    prisma.playlistItem.deleteMany({ where: { playlistId: playlist.id } }),
  ];
  if (showTracks.length > 0) {
    operations.push(
      prisma.playlistItem.createMany({
        data: showTracks.map((t, index) => ({
          playlistId: playlist.id,
          trackId: t.id,
          position: index,
        })),
      }),
    );
  }
  await prisma.$transaction(operations);

  const excluded = tracks.length - showTracks.length;
  logger.log(
    `show-list: ${showTracks.length} brani (esclusi ${excluded} fuori show list)`,
  );
  return { total: showTracks.length };
}

async function main() {
  console.log(`[scan] start ${timestamp()}`);
  console.log(`[scan] MUSIC_DIR=${MUSIC_DIR}`);
  console.log(`[scan] COVERS_DIR=${COVERS_DIR}`);
  console.log(`[scan] PIRATE_DAY_DIR=${PIRATE_DAY_DIR}`);

  if (!fs.existsSync(MUSIC_DIR)) {
    console.warn(`[scan] ⚠ MUSIC_DIR non esiste, creo cartella vuota`);
    fs.mkdirSync(MUSIC_DIR, { recursive: true });
  }

  const audioFiles = walkMp3(MUSIC_DIR, logger);
  console.log(`[scan] trovati ${audioFiles.length} file .mp3`);

  // ── 1. Parse + UPSERT in batch ──────────────────────────────────────
  const { upserted, skipped } = await scanDirectory(prisma, {
    root: MUSIC_DIR,
    coversDir: COVERS_DIR,
    batchSize: BATCH_SIZE,
    logger,
    files: audioFiles,
  });
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

  // ── 4. Mantenimento della playlist show-list ───────────────────────
  // Viene dopo la pulizia degli orfani: la show list non deve referenziare
  // brani già spariti dal disco.
  try {
    await maintainShowList(audioFiles);
  } catch (err) {
    console.warn(
      `[scan] ⚠ manutenzione show-list fallita (scan completato comunque): ${
        err.message ?? err
      }`,
    );
    process.exitCode = 1;
  }

  // ── 5. Waveform dei brani (picchi per il player) ─────────────────────
  // Su Stellar non c'è ffmpeg: il decode usa mpg123-decoder (WASM).
  // Ricalcola SOLO i brani senza file waveform, quindi dopo il primo giro
  // non costa più nulla. Un errore qui non deve mai far fallire lo scan.
  try {
    await generateWaveforms();
  } catch (err) {
    console.warn(
      `[scan] ⚠ generazione waveform fallita (scan completato comunque): ${
        err.message ?? err
      }`,
    );
  }

  console.log(`[scan] ✓ done ${timestamp()}`);
}

/**
 * Calcola e salva la waveform dei brani che non ce l'hanno ancora.
 * Chiamata dallo scan: gira solo quando il file manca, quindi il costo è
 * una tantum per brano e non a ogni passaggio del cron.
 */
async function generateWaveforms() {
  fs.mkdirSync(waveformsDir(), { recursive: true });

  const tracks = await prisma.track.findMany({
    select: { id: true, filePath: true, title: true, artist: true },
    orderBy: { id: "asc" },
  });

  const pending = tracks.filter((t) => !fs.existsSync(waveformFileFor(t.id)));
  if (pending.length === 0) {
    console.log("[scan] waveform già presenti per tutti i brani");
    return;
  }

  console.log(`[scan] ${pending.length} brano/i senza waveform, calcolo...`);

  let ok = 0;
  let failed = 0;
  for (const track of pending) {
    try {
      const filePath = ensureInside(MUSIC_DIR, track.filePath);
      if (!fs.existsSync(filePath)) {
        throw new Error(`file non trovato: ${filePath}`);
      }
      const t0 = Date.now();
      const { peaks } = await computeWaveform(filePath);
      fs.writeFileSync(waveformFileFor(track.id), serializeWaveform(peaks), "utf8");
      ok++;
      console.log(
        `[scan]   ✓ waveform ${track.title} (${Date.now() - t0} ms)`,
      );
    } catch (err) {
      failed++;
      console.warn(
        `[scan]   ⚠ waveform fallita per ${track.title}: ${err.message ?? err}`,
      );
    }
  }
  console.log(`[scan] waveform: ${ok} calcolate, ${failed} fallite`);
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
