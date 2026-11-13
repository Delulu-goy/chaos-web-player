// Chaos Radio — Pirate Day: generatore del manifest
//
// Crea (o rigenera) `private/audio/pirate-day/manifest.json` a partire da:
//   - i MP3 presenti nella cartella del Pirate Day (ordine alfabetico);
//   - i metadati dell'edizione precedente (curatore, descrizione);
//   - la prossima edizione (max edizioni pubblicate nel DB + 1);
//   - la prossima data "venerdì 22:00" Europe/Rome (o quella dell'edizione
//     precedente, se esiste).
//
// Pensato per il pulsante "Run JS Script" di cPanel, che avvia il file
// senza opzioni: per questo lo script
//   1. fa il chdir sull'application root (così `.env` e le cartelle
//      relative si risolvono sempre, da qualunque directory parta il
//      processo);
//   2. si rilancia da solo con `--experimental-strip-types` se il Node in
//      uso non sa importare i .ts (il client Prisma è un file .ts).
//
// Uso:
//   node scripts/pirate-day-init.js
//   node --env-file=.env --experimental-strip-types scripts/pirate-day-init.js
//
// Argomenti:
//   --force            sovrascrive il manifest anche se più recente del calcolato
//   --edition=N        forza il numero di edizione
//   --publish-at=ISO   forza la data/ora di pubblicazione
//
// Env vars:
//   PIRATE_DAY_INIT_PUBLISH_AT - default: prossimo venerdì 22:00 (Europe/Rome)
//   PIRATE_DAY_INIT_WEEKDAY   - default: "Fri"
//   PIRATE_DAY_INIT_HOUR       - default: 22
//
// Exit code: 0 (manifest scritto) / 1 (errore).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { loadEnv, optionalEnv, timestamp } from "./_shared.mjs";
import { pirateDayDir } from "../src/lib/paths.js";
import { normalizeCuratorLinks } from "./lib/curator.mjs";
import { makeLogger } from "./lib/audioScan.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Application root = backend/ (lo script sta in backend/scripts/).
// "Run JS Script" di cPanel può avviare il processo da una directory
// qualsiasi: il chdir qui fa risolvere `.env` (che `loadEnv()` legge dalla
// cwd) e le cartelle relative sempre allo stesso posto.
const APP_ROOT = path.resolve(__dirname, "..");
process.chdir(APP_ROOT);

const REEXEC_ENV = "PIRATE_DAY_INIT_REEXEC";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const logger = makeLogger("pirate-day");

// ── Parametri ───────────────────────────────────────────────────────────

const PIRATE_DAY_DIR = pirateDayDir();
const MANIFEST_NAME = optionalEnv("PIRATE_DAY_MANIFEST", "manifest.json");
const ARCHIVE_DIR = path.join(PIRATE_DAY_DIR, "_archive");

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const editionArg = args.find((a) => a.startsWith("--edition="));
const publishAtArg = args.find((a) => a.startsWith("--publish-at="));
const WEEKDAY = (optionalEnv("PIRATE_DAY_INIT_WEEKDAY", "Fri") ?? "Fri").trim();
const HOUR = parseInt(optionalEnv("PIRATE_DAY_INIT_HOUR", "22") ?? "22", 10);
const TIME_ZONE = optionalEnv("PIRATE_DAY_INIT_TZ", "Europe/Rome") ?? "Europe/Rome";

/** Descrizione di fallback (quando non c'è né env var né edizione). */
const DEFAULT_DESCRIPTION =
  "**A new transmission begins.** Twenty-four hours of pirate frequencies, broadcasts from somewhere off the coast.\n\n" +
  "Curated by **DJ Skeleton** with selections from the deep archive. " +
  "Tune in, stay awhile. The signal is clearer after dark.";

// ── Bootstrap: re-exec se il Node non sa importare i .ts ───────────────

/** Il flag è supportato da questa versione di Node? */
function supportsFlag(flag) {
  const probe = spawnSync(process.execPath, [flag, "-e", "0"], { stdio: "ignore" });
  return probe.status === 0;
}

/**
 * Rilancia lo script con `--experimental-strip-types`.
 * Il guard `REEXEC_ENV` evita il ciclo: se il flag non esiste (Node troppo
 * vecchio), il figlio fallisce con un errore chiaro invece di ripartire.
 */
function reexecWithStripTypes() {
  const scriptArgs = process.argv.slice(1);
  const childArgs = supportsFlag("--experimental-strip-types")
    ? ["--experimental-strip-types", ...scriptArgs]
    : scriptArgs;
  console.log(
    `[pirate-day] Node senza type-stripping: rilancio con ${childArgs[0] ?? ""}`,
  );
  const result = spawnSync(process.execPath, childArgs, {
    stdio: "inherit",
    env: { ...process.env, [REEXEC_ENV]: "1" },
  });
  process.exit(result.status === null ? 1 : result.status);
}

/**
 * Importa la factory Prisma (che importa il client .ts).
 * @returns {Promise<{makePrisma: Function}>}
 */
async function loadPrismaLib() {
  try {
    return await import("./lib/prisma.mjs");
  } catch (err) {
    const message = String(err?.message ?? err);
    const needsStrip =
      err?.code === "ERR_UNKNOWN_FILE_EXTENSION" ||
      message.includes("Unknown file extension");
    if (!needsStrip || process.env[REEXEC_ENV] === "1") throw err;
    reexecWithStripTypes();
    return null; // mai raggiunto: reexecWithStripTypes() termina il processo
  }
}

// ── Utility ─────────────────────────────────────────────────────────────

/**
 * Parti di una data nel fuso indicato.
 * @returns {{year, month, day, hour, minute, second, weekday}}
 */
function zonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  );
  const hour = Number(parts.hour);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Alcune versioni di ICU restituiscono "24" per la mezzanotte.
    hour: hour === 24 ? 0 : hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: parts.weekday,
  };
}

/**
 * Converte un "orario murale" di un fuso in un istante UTC.
 * @param {{year, month, day, hour, minute}} wall
 * @param {string} timeZone
 * @returns {Date}
 */
function wallClockToInstant(wall, timeZone) {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0);
  let instant = guess;
  // Due passaggi: il primo usa l'offset approssimato, il secondo
  // ricalcola con l'offset reale ( DST ).
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(instant), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const offsetMs = asUtc - instant;
    instant = guess - offsetMs;
  }
  return new Date(instant);
}

/**
 * Prossima occorrenza di un giorno della settimana a un'ora fissa, nel fuso
 * indicato, a partire da `from`.
 * @returns {Date}
 */
function nextWeekdayAt({ weekday, hour, minute = 0, timeZone, from }) {
  const targetIdx = WEEKDAYS.indexOf(weekday);
  const now = zonedParts(from, timeZone);
  const nowIdx = WEEKDAYS.indexOf(now.weekday);

  let daysAhead = (targetIdx - nowIdx + 7) % 7;
  // Se oggi è il giorno giusto ma l'orario è già passato → la prossima.
  if (daysAhead === 0) {
    const nowMinutes = now.hour * 60 + now.minute;
    if (nowMinutes >= hour * 60 + minute) daysAhead = 7;
  }

  // Data candidate: stessa data di "from" + daysAhead giorni (aritmetica
  // su date naive, immune ai cambi di fuso).
  const naive = new Date(Date.UTC(now.year, now.month - 1, now.day + daysAhead));
  return wallClockToInstant(
    {
      year: naive.getUTCFullYear(),
      month: naive.getUTCMonth() + 1,
      day: naive.getUTCDate(),
      hour,
      minute,
    },
    timeZone,
  );
}

/** Numero di edizione da slug `pirate-day-<n>`. */
function editionFromSlug(slug) {
  const m = /^pirate-day-(\d+)$/.exec(slug ?? "");
  return m ? Number(m[1]) : null;
}

/**
 * Stringa non vuota, o undefined.
 * @param {unknown} value
 * @returns {string|undefined}
 */
function text(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Curatore di fallback letto dalle env var.
 * `PIRATE_DAY_CURATOR_LINKS` è un JSON su una riga:
 * `{"spotify":"https://…","soundcloud":"https://…"}`.
 */
function readEnvCurator() {
  const linksRaw = optionalEnv("PIRATE_DAY_CURATOR_LINKS", null);
  let links = null;
  if (linksRaw) {
    try {
      links = normalizeCuratorLinks(JSON.parse(linksRaw));
    } catch (err) {
      logger.warn(
        `  ⚠ PIRATE_DAY_CURATOR_LINKS non è un JSON valido, lo ignoro: ${err.message}`,
      );
    }
  }
  return {
    name: text(optionalEnv("PIRATE_DAY_CURATOR_NAME", null)),
    role: text(optionalEnv("PIRATE_DAY_CURATOR_ROLE", null)),
    avatar: text(optionalEnv("PIRATE_DAY_CURATOR_AVATAR", null)) ?? null,
    links,
  };
}

/**
 * I link del curatore: vince il primo valore non vuoto nell'ordine
 *   manifest → edizione pubblicata → env var.
 *
 * Coerente con nome/ruolo/avatar: un valore vuoto non "blocca" la catena,
 * lascia semplicemente passare al successivo.
 */
function pickCuratorLinks(currentCurator, previous, envLinks) {
  const fromManifest = currentCurator
    ? normalizeCuratorLinks(currentCurator.links)
    : null;
  if (fromManifest) return fromManifest;

  const fromDb = previous ? normalizeCuratorLinks(previous.curatorLinks) : null;
  if (fromDb) return fromDb;

  return envLinks;
}

// ── Manifest ────────────────────────────────────────────────────────────

const manifestPath = path.resolve(PIRATE_DAY_DIR, MANIFEST_NAME);

function readCurrentManifest() {
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const raw = fs.readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, "");
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : null;
  } catch (err) {
    logger.warn(`manifest attuale non leggibile (${err.message}), lo rigenero`);
    return null;
  }
}

/** Scrive il manifest in UTF-8 senza BOM, con newline finale. */
function writeManifest(manifest) {
  fs.mkdirSync(PIRATE_DAY_DIR, { recursive: true });
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(manifest, null, 2) + "\n",
    { encoding: "utf8" },
  );
}

/** Archivia il manifest corrente in `_archive/manifest-<edition>.json`. */
function archiveCurrentManifest(current, edition) {
  if (!current) return;
  try {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    const currentEdition = Number(current.edition);
    const name = `manifest-${Number.isInteger(currentEdition) ? currentEdition : edition}.json`;
    fs.copyFileSync(manifestPath, path.join(ARCHIVE_DIR, name));
    logger.log(`manifest precedente archiviato in _archive/${name}`);
  } catch (err) {
    logger.warn(`  ⚠ archiviazione fallita: ${err.message ?? err}`);
  }
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[pirate-day] start ${timestamp()}`);
  console.log(`[pirate-day] APP_ROOT=${APP_ROOT}`);
  console.log(`[pirate-day] PIRATE_DAY_DIR=${PIRATE_DAY_DIR}`);

  loadEnv();

  const { makePrisma } = await loadPrismaLib();
  const prisma = makePrisma();

  try {
    // ── 1. Edizioni già pubblicate (per il numero e i metadati) ────────
    const editions = await prisma.playlist.findMany({
      where: { kind: "PIRATE_DAY" },
      select: {
        slug: true,
        title: true,
        startsAt: true,
        endsAt: true,
        curatorName: true,
        curatorRole: true,
        curatorAvatar: true,
        curatorLinks: true,
        description: true,
      },
      orderBy: { id: "desc" },
    });

    const known = editions
      .map((e) => ({ ...e, edition: editionFromSlug(e.slug) }))
      .filter((e) => e.edition !== null);
    const published = known.map((e) => e.edition);
    const maxEdition = published.reduce((max, e) => Math.max(max, e), 0);
    const previous = known.sort((a, b) => b.edition - a.edition)[0] ?? null;

    const current = readCurrentManifest();
    const currentEdition = current ? Number(current.edition) : null;

    // L'edizione descritta dal manifest attuale è "in attesa" se non è
    // ancora stata pubblicata: rigenerarla non deve cambiarne il numero
    // (altrimenti ogni giro di init salterebbe un'edizione).
    const pending =
      Number.isInteger(currentEdition) && !published.includes(currentEdition);

    let edition;
    if (editionArg) {
      edition = Number(editionArg.split("=")[1]);
    } else if (pending) {
      edition = currentEdition;
    } else {
      edition = maxEdition + 1;
    }
    if (!Number.isInteger(edition) || edition < 1) {
      throw new Error("numero di edizione non valido");
    }

    // Guard: il manifest descrive un'edizione non ancora pubblicata →
    // non lo sovrascrivo (cambierebbe la programmazione) senza --force.
    // Un --edition esplicito è già un'intenzione precisa: in quel caso si
    // procede (l'utente sa cosa sta facendo).
    if (pending && !FORCE && !editionArg) {
      logger.warn(
        `manifest dell'edizione #${currentEdition} non ancora pubblicata: non sovrascrivo (usa --force)`,
      );
      console.log(`[pirate-day] ✓ nessuna modifica (exit 0)`);
      return;
    }

    // ── 2. Data di pubblicazione ──────────────────────────────────────
    let publishAt;
    if (publishAtArg) {
      publishAt = new Date(publishAtArg.split("=")[1]);
      if (Number.isNaN(publishAt.getTime())) {
        throw new Error(`--publish-at non valido: ${publishAtArg}`);
      }
    } else if (optionalEnv("PIRATE_DAY_INIT_PUBLISH_AT", null)) {
      publishAt = new Date(optionalEnv("PIRATE_DAY_INIT_PUBLISH_AT", null));
      if (Number.isNaN(publishAt.getTime())) {
        throw new Error("PIRATE_DAY_INIT_PUBLISH_AT non è una data valida");
      }
    } else {
      // Giorno e ora fissi (env var o default): non si ereditano
      // dall'edizione precedente, altrimenti un publish in ritardo
      // ("è ora?" risposto alle 23:45) farebbe slittare di un'ora tutte
      // le edizioni successive.
      publishAt = nextWeekdayAt({
        weekday: WEEKDAY,
        hour: Number.isFinite(HOUR) ? HOUR : 22,
        timeZone: TIME_ZONE,
        from: new Date(),
      });
    }

    // ── 3. Brani presenti in cartella (ordine alfabetico = ordine curato) ─
    fs.mkdirSync(PIRATE_DAY_DIR, { recursive: true });
    const files = fs
      .readdirSync(PIRATE_DAY_DIR, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".mp3"))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, "it"));

    // ── 4. Curatore e descrizione ─────────────────────────────────────
    //
    // CURATORE — cambia a ogni edizione → vive nel MANIFEST (lo editi a
    // mano) e viene trascinato avanti a ogni giro. Il DB è il fallback
    // (prima edizione), poi le env var, poi i default.
    //
    // DESCRIZIONE — costante → la fornisce l'ENV VAR; se manca si usa il
    // manifest, poi il DB, poi il default.
    const currentCurator =
      current && typeof current.curator === "object" && current.curator !== null
        ? current.curator
        : null;

    const envCurator = readEnvCurator();
    const envDescription = optionalEnv("PIRATE_DAY_DESCRIPTION", null);

    const curatorName =
      text(currentCurator?.name) ??
      text(previous?.curatorName) ??
      text(envCurator.name);
    const curatorRole =
      text(currentCurator?.role) ??
      text(previous?.curatorRole) ??
      text(envCurator.role);
    const curatorAvatar =
      text(currentCurator?.avatar) ??
      text(previous?.curatorAvatar) ??
      text(envCurator.avatar) ??
      null;
    const curatorLinks = pickCuratorLinks(
      currentCurator,
      previous,
      envCurator.links,
    );

    const curatorSource = text(currentCurator?.name)
      ? "manifest"
      : text(previous?.curatorName)
        ? "edizione precedente"
        : text(envCurator.name)
          ? "env var"
          : "default";

    const curator = {
      name: curatorName ?? "DJ Skeleton",
      role: curatorRole ?? "Resident Curator",
      avatar: curatorAvatar,
      links: curatorLinks,
    };

    const description =
      (envDescription ? envDescription.replace(/\\n/g, "\n") : null) ??
      text(current?.description) ??
      previous?.description ??
      DEFAULT_DESCRIPTION;

    // ── 5. Manifest ────────────────────────────────────────────────────
    const manifest = {
      edition,
      title: `PIRATE DAY #${edition}`,
      publishAt: publishAt.toISOString(),
      durationHours: 24,
      description,
      curator,
      tracks: files,
    };

    if (
      current &&
      Number.isInteger(currentEdition) &&
      currentEdition > edition &&
      !FORCE
    ) {
      logger.warn(
        `manifest attuale (edizione #${currentEdition}) più recente del calcolato (#${edition}): non sovrascrivo (usa --force)`,
      );
      console.log(`[pirate-day] ✓ nessuna modifica (exit 0)`);
      return;
    }

    archiveCurrentManifest(current, edition);
    writeManifest(manifest);

    console.log(
      `[pirate-day] ✓ manifest creato: ${manifestPath}`,
    );
    logger.log(`edizione #${edition}, publishAt=${manifest.publishAt}`);
    logger.log(`brani: ${files.length}${files.length ? ` (${files.join(", ")})` : ""}`);
    // Il curatore cambia a ogni edizione: se non viene da una env var è
    // un valore ripreso → va ricordato che va cambiato.
    logger.log(
      `curatore: ${curator.name ?? "—"} / ${curator.role ?? "—"} (da ${curatorSource})`,
    );
    if (curatorSource !== "env var") {
      logger.warn("ricordati di cambiare il curatore per questa edizione");
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
