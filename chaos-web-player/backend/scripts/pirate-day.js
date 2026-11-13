// Chaos Radio — Pirate Day: pubblicazione e cleanup delle edizioni
//
// Due fasi idempotenti, eseguite dallo stesso comando:
//
//   FASE A — PUBLISH
//     Legge il manifest della cartella `PIRATE_DAY_DIR`, e se l'edizione
//     è "dovuta" (now >= publishAt) la pubblica: crea/aggiorna la
//     playlist `pirate-day-<edition>` con curatore, descrizione, finestra
//     di 24h e i brani nell'ordine del manifest.
//
//   FASE B — CLEANUP
//     Per ogni edizione scaduta (endsAt <= now) cancella i FILE di
//     quell'edizione (non tutta la cartella!) e poi le righe del DB.
//
// L'ordine è FILE PRIMA, DB DOPO: se cancellassimo prima il DB, un file
// rimasto su disco verrebbe re-inserito dallo scanner come track orfano
// senza più nessuna edizione che lo referenzia → non verrebbe più rimosso.
//
// Uso:
//   node --env-file=.env --experimental-strip-types scripts/pirate-day.js
//   # in cron (orario, il manifest decide il giorno):
//   0 * * * * cd /home/.../backend && node --env-file=.env --experimental-strip-types scripts/pirate-day.js >> logs/pirate-day.log 2>&1
//
// Env vars (tutte opzionali, con default sensati):
//   MUSIC_DIR               - default: "<cwd>/private/audio"
//   COVERS_DIR              - default: "<cwd>/private/covers"
//   PIRATE_DAY_DIR          - default: "<cwd>/private/audio/pirate-day"
//                             (DEVE stare dentro MUSIC_DIR, vedi V1/V2)
//   PIRATE_DAY_MANIFEST     - default: "manifest.json" (relativo a PIRATE_DAY_DIR)
//   PIRATE_DAY_WINDOW_HOURS - default: 24 (durata della finestra)
//   PIRATE_DAY_KEEP_FILES   - se "1" la fase B NON cancella i file (solo DB): debug
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
import { waveformFileFor } from "../src/lib/waveformStore.js";
import { pirateDayDir } from "../src/lib/paths.js";
import { normalizeCuratorLinks } from "./lib/curator.mjs";
import {
  makeLogger,
  scanOne,
  upsertTrack,
  walkMp3,
} from "./lib/audioScan.mjs";

loadEnv();

const MUSIC_DIR = resolveDir(
  "MUSIC_DIR",
  path.resolve(process.cwd(), "private/audio"),
);
const COVERS_DIR = resolveDir(
  "COVERS_DIR",
  path.resolve(process.cwd(), "private/covers"),
);
// La cartella del Pirate Day DEVE stare dentro MUSIC_DIR: fuori, scan.js
// la tratterebbe come track orfani e cancellerebbe i brani ogni 5 minuti.
const PIRATE_DAY_DIR = pirateDayDir();
const MANIFEST_NAME = optionalEnv("PIRATE_DAY_MANIFEST", "manifest.json");
const WINDOW_HOURS = Math.max(
  1,
  parseInt(optionalEnv("PIRATE_DAY_WINDOW_HOURS", "24"), 10) || 24,
);
const KEEP_FILES = optionalEnv("PIRATE_DAY_KEEP_FILES", "") === "1";

const logger = makeLogger("pirate-day");

// ─────────────────────────────────────────────────────────────────────────
// Manifest
// ─────────────────────────────────────────────────────────────────────────

/**
 * Normalizza i link del curatore nel formato che il frontend si aspetta:
 * un oggetto `{spotify: url, ...}`.
 *
 * Il formato ad array (`[{type, url}]`, usato dal vecchio seed) faceva
 * crashare `CuratorCard` (ICONS["0"] undefined): qui viene convertito o,
 * se non riconoscibile, scartato.
 */

/**
 * Valida il manifest e restituisce la versione normalizzata.
 * @throws {Error} se il manifest è irrecuperabile (JSON rotto, edition mancante)
 */
function parseManifest(raw) {
  let data;
  try {
    // La BOM UTF-8 (salita in testa al file da editor Windows / FTP)
    // non è JSON valido: si rimuove prima del parse.
    data = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (err) {
    throw new Error(`manifest non valido (JSON): ${err.message}`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("manifest non valido: deve essere un oggetto JSON");
  }

  const edition = Number(data.edition);
  if (!Number.isInteger(edition)) {
    throw new Error("manifest non valido: 'edition' deve essere un intero");
  }

  let publishAt = null;
  if (data.publishAt) {
    const parsed = new Date(data.publishAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(
        `manifest non valido: 'publishAt' non è una data valida (${data.publishAt})`,
      );
    }
    publishAt = parsed;
  }

  const durationHours =
    typeof data.durationHours === "number" && data.durationHours > 0
      ? data.durationHours
      : WINDOW_HOURS;

  const curator = data.curator && typeof data.curator === "object" ? data.curator : {};

  // `tracks` assente → la lista viene DERIVATA dalla cartella (ordine
  // alfabetico = ordine curato con il prefisso numerico). Un array
  // esplicito, anche vuoto, viene invece rispettato.
  const tracks = Array.isArray(data.tracks)
    ? data.tracks.filter((t) => typeof t === "string" && t.trim() !== "")
    : null;

  return {
    edition,
    title:
      typeof data.title === "string" && data.title.trim()
        ? data.title.trim()
        : `PIRATE DAY #${edition}`,
    publishAt,
    durationHours,
    description:
      typeof data.description === "string" ? data.description : null,
    curator: {
      name: typeof curator.name === "string" ? curator.name : null,
      role: typeof curator.role === "string" ? curator.role : null,
      avatar: typeof curator.avatar === "string" ? curator.avatar : null,
      links: normalizeCuratorLinks(curator.links),
    },
    tracks,
  };
}

/**
 * Legge il manifest dalla cartella del Pirate Day.
 * @returns {{status: "missing"|"ok", path: string, manifest?: object}}
 */
function readManifest() {
  const manifestPath = path.resolve(PIRATE_DAY_DIR, MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) {
    return { status: "missing", path: manifestPath };
  }
  const raw = fs.readFileSync(manifestPath, "utf8");
  return { status: "ok", path: manifestPath, manifest: parseManifest(raw) };
}

// ─────────────────────────────────────────────────────────────────────────
// Fase A — publish
// ─────────────────────────────────────────────────────────────────────────

/**
 * Elenco dei .mp3 presenti nella cartella del Pirate Day, in ordine
 * alfabetico. L'ordinamento segue il prefisso numerico dei nomi file
 * ("01 - …", "02 - …"), che è l'ordine curato.
 */
function listFolderTracks() {
  try {
    return fs
      .readdirSync(PIRATE_DAY_DIR, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".mp3"))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, "it"));
  } catch {
    return [];
  }
}

/**
 * Risolve i file elencati nel manifest:
 *   - duplicati → warning + skip (PK playlist_items: un brano non può
 *     ripetersi nella stessa playlist);
 *   - file assenti → warning + skip;
 *   - file in cartella non listati → warning (esclusi dall'edizione).
 *
 * Se il manifest non ha il campo `tracks`, la lista viene derivata dalla
 * cartella (ordine alfabetico = ordine curato con il prefisso numerico).
 */
function resolveManifestTracks(manifest) {
  const entries = [];
  const seen = new Set();

  const listed = manifest.tracks ?? listFolderTracks();
  if (manifest.tracks === null) {
    logger.log(
      `manifest senza "tracks": uso i ${listed.length} file presenti in cartella`,
    );
  }

  listed.forEach((name, index) => {
    if (seen.has(name)) {
      logger.warn(`  ⚠ brano duplicato nel manifest, ignorato: ${name}`);
      return;
    }
    seen.add(name);

    let abs;
    try {
      abs = ensureInside(PIRATE_DAY_DIR, path.resolve(PIRATE_DAY_DIR, name));
    } catch {
      logger.warn(`  ⚠ path fuori dalla cartella del pirate day, ignorato: ${name}`);
      return;
    }
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      logger.warn(`  ⚠ file inesistente, saltato: ${name}`);
      return;
    }
    entries.push({ name, position: index, filePath: abs });
  });

  // File presenti in cartella ma non listati nel manifest: warning, ma
  // restano su disco (possono essere dell'edizione successiva).
  const listedAbs = new Set(entries.map((e) => e.filePath));
  for (const file of walkMp3(PIRATE_DAY_DIR, logger)) {
    if (!listedAbs.has(file)) {
      logger.warn(
        `  ⚠ file in cartella non listato nel manifest, escluso: ${path.basename(file)}`,
      );
    }
  }

  return entries;
}

/**
 * Fase A: pubblica l'edizione del manifest (se dovuta).
 * @returns {Promise<{published: boolean, slug: string}>}
 */
async function publishPhase(prisma, manifest, now) {
  const slug = `pirate-day-${manifest.edition}`;
  const publishAt = manifest.publishAt ?? now;

  if (publishAt.getTime() > now.getTime()) {
    logger.log(
      `edizione #${manifest.edition} non ancora dovuta (publishAt=${publishAt.toISOString()}), niente pubblicato`,
    );
    return { published: false, slug };
  }

  // ── Track: upsert idempotente su filePath ──────────────────────────
  const entries = resolveManifestTracks(manifest);
  const tracks = [];
  for (const entry of entries) {
    const data = await scanOne(entry.filePath, { coversDir: COVERS_DIR, logger });
    if (!data) {
      logger.warn(`  ⚠ brano non leggibile, saltato: ${entry.name}`);
      continue;
    }
    const row = await upsertTrack(prisma, data);
    tracks.push({ track: row, position: entry.position });
  }
  logger.log(
    `edizione #${manifest.edition}: ${tracks.length}/${entries.length} brani pronti`,
  );

  // ── Playlist: tre casi ──────────────────────────────────────────────
  const existing = await prisma.playlist.findUnique({ where: { slug } });
  const windowMs = manifest.durationHours * 60 * 60 * 1000;
  const content = {
    title: manifest.title,
    kind: "PIRATE_DAY",
    curatorName: manifest.curator.name,
    curatorRole: manifest.curator.role,
    curatorAvatar: manifest.curator.avatar,
    curatorLinks: manifest.curator.links,
    description: manifest.description,
  };

  let playlist;
  let startsAt;
  let endsAt;

  if (!existing) {
    // (a) nuova edizione: finestra startsAt = max(publishAt, now)
    startsAt = new Date(Math.max(publishAt.getTime(), now.getTime()));
    endsAt = new Date(startsAt.getTime() + windowMs);
    playlist = await prisma.playlist.create({
      data: { slug, ...content, startsAt, endsAt },
    });
    logger.log(`edizione #${manifest.edition} creata (${slug})`);
  } else if (existing.endsAt && existing.endsAt.getTime() > now.getTime()) {
    // (b) edizione già live: si aggiornano i contenuti, la finestra NON
    //     si sposta (l'edizione resta quella già iniziata).
    startsAt = existing.startsAt;
    endsAt = existing.endsAt;
    playlist = await prisma.playlist.update({
      where: { id: existing.id },
      data: content,
    });
    logger.log(
      `edizione #${manifest.edition} già in onda, contenuti aggiornati (finestra invariata)`,
    );
  } else {
    // (c) edizione scaduta: si riapre la finestra da now (re-pubblicazione)
    startsAt = now;
    endsAt = new Date(now.getTime() + windowMs);
    playlist = await prisma.playlist.update({
      where: { id: existing.id },
      data: { ...content, startsAt, endsAt },
    });
    logger.log(
      `edizione #${manifest.edition} scaduta, finestra riaperta da ${startsAt.toISOString()}`,
    );
  }

  // ── playlist_items: position = indice del manifest ──────────────────
  const operations = [
    prisma.playlistItem.deleteMany({ where: { playlistId: playlist.id } }),
  ];
  if (tracks.length > 0) {
    operations.push(
      prisma.playlistItem.createMany({
        data: tracks.map(({ track, position }) => ({
          playlistId: playlist.id,
          trackId: track.id,
          position,
        })),
      }),
    );
  }
  await prisma.$transaction(operations);

  // ── Notifica broadcast (idempotente: una per edizione) ─────────────
  const body = `Pirate Day #${manifest.edition} is on the air`;
  const alreadyNotified = await prisma.notification.findFirst({ where: { body } });
  if (!alreadyNotified) {
    await prisma.notification.create({ data: { userId: null, body } });
  }

  logger.log(
    `✓ #${manifest.edition} pubblicato (endsAt=${endsAt?.toISOString() ?? "null"})`,
  );
  return { published: true, slug };
}

// ─────────────────────────────────────────────────────────────────────────
// Fase B — cleanup
// ─────────────────────────────────────────────────────────────────────────

/**
 * Cancella un file se esiste. ENOENT è ignorato (il file è già sparito:
 * è il caso normale dopo un giro precedente).
 */
function unlinkIfExists(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }
}

/**
 * Fase B: rimuove file e righe delle edizioni scadute.
 * @param {string|null} reservedSlug edizione riservata dal manifest: non
 *   viene ripulita (i suoi file sono quelli dell'edizione in arrivo).
 */
async function cleanupPhase(prisma, now, reservedSlug) {
  const expired = await prisma.playlist.findMany({
    where: { kind: "PIRATE_DAY", endsAt: { lte: now } },
    include: {
      items: {
        include: { track: { select: { id: true, filePath: true } } },
      },
    },
  });

  if (expired.length === 0) {
    logger.log("cleanup: nessuna edizione scaduta");
    return { failed: 0, removed: 0 };
  }

  let failed = 0;
  let removed = 0;

  for (const edition of expired) {
    if (reservedSlug && edition.slug === reservedSlug) {
      logger.log(
        `cleanup: edizione ${edition.slug} riservata dal manifest, saltata`,
      );
      continue;
    }

    // La sorgente di verità sono i playlist_items dell'edizione: i file
    // da cancellare sono SOLO quelli di quell'edizione (il curatore può
    // aver caricato in anticipo i file dell'edizione successiva).
    const trackIds = [];
    let ok = true;

    for (const item of edition.items) {
      const { id, filePath } = item.track;
      trackIds.push(id);
      if (KEEP_FILES) continue;

      try {
        const abs = ensureInside(PIRATE_DAY_DIR, filePath);
        unlinkIfExists(abs);
        // La waveform è l'unico file derivato che nessuno pulisce:
        // le cover vengono già ripulite da scan.js (cleanOrphanCovers).
        unlinkIfExists(waveformFileFor(id));
      } catch (err) {
        ok = false;
        logger.warn(
          `  ✗ cleanup fallito per ${filePath}: ${err.message ?? err}`,
        );
      }
    }

    if (!ok) {
      failed++;
      logger.warn(
        `  ⚠ edizione ${edition.slug}: cleanup incomplesso, il giro successivo ritenta`,
      );
      continue;
    }

    // File prima, DB dopo: solo ora le righe canellano (cascade su
    // playlist_items e favorites).
    if (trackIds.length > 0) {
      await prisma.track.deleteMany({ where: { id: { in: trackIds } } });
    }
    await prisma.playlist.delete({ where: { id: edition.id } });
    removed++;
    logger.log(
      `✓ edizione ${edition.slug} rimossa (${trackIds.length} brani${
        KEEP_FILES ? ", file mantenuti" : ""
      })`,
    );
  }

  return { failed, removed };
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[pirate-day] start ${timestamp()}`);
  console.log(`[pirate-day] PIRATE_DAY_DIR=${PIRATE_DAY_DIR}`);
  console.log(
    `[pirate-day] manifest=${path.resolve(PIRATE_DAY_DIR, MANIFEST_NAME)}`,
  );
  console.log(
    `[pirate-day] finestra=${WINDOW_HOURS}h, keep_files=${KEEP_FILES ? "1" : "0"}`,
  );

  const prisma = makePrisma();
  const now = new Date();
  let reservedSlug = null;

  try {
    // ── Fase A — publish ───────────────────────────────────────────────
    let manifest = null;
    try {
      const result = readManifest();
      if (result.status === "missing") {
        logger.warn(
          `manifest non trovato (${result.path}), niente da pubblicare`,
        );
      } else {
        manifest = result.manifest;
        reservedSlug = `pirate-day-${manifest.edition}`;
        await publishPhase(prisma, manifest, now);
      }
    } catch (err) {
      console.error(`[pirate-day] ✗ fase publish fallita: ${err.message ?? err}`);
      process.exitCode = 1;
    }

    // ── Fase B — cleanup ───────────────────────────────────────────────
    // Prosegue comunque: la pulizia delle edizioni scadute non dipende
    // dal manifest.
    const { failed } = await cleanupPhase(prisma, now, reservedSlug);
    if (failed > 0) {
      process.exitCode = 1;
    }

    console.log(`[pirate-day] ✓ done ${timestamp()}`);
  } finally {
    try {
      await prisma.$disconnect();
    } catch {
      /* already disconnected */
    }
  }
}

main().catch((err) => {
  console.error(`[pirate-day] FATAL`, err);
  process.exitCode = 1;
});
