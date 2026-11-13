// Chaos Radio — Generatore delle waveform (picchi) dei brani
//
// Calcola la waveform di ogni brano in libreria e la salva come file in
// `private/waveforms/waveform-<trackId>.txt` (300 byte in base64).
//
// Su Stellar non c'è ffmpeg: il decoding usa `mpg123-decoder` (build
// WebAssembly di mpg123, nessuna dipendenza nativa). Il decode avviene a
// chunk di frame per tenere la memoria sotto ~60 MB.
//
// Lo script è IDEMPOTENTE: ricalcola solo i brani senza file waveform.
// Con `--force` ricalcola tutti.
//
// Uso:
//   npm run waveforms            # solo i brani senza waveform
//   npm run waveforms -- --force # ricalcola tutti
//
// Env:
//   MUSIC_DIR            - default: <cwd>/private/audio
//   WAVEFORMS_DIR        - default: <cwd>/private/waveforms
//   WAVEFORM_TIMEOUT_MS  - timeout per brano, default 60000

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { loadEnv, optionalEnv, timestamp, ensureInside } from "./_shared.mjs";
import { computeWaveform, serializeWaveform } from "./lib/waveform.mjs";
import { waveformFileFor, waveformsDir } from "../src/lib/waveformStore.js";

loadEnv();

const MUSIC_DIR = path.resolve(
  optionalEnv("MUSIC_DIR", path.resolve(process.cwd(), "private/audio")),
);
const TIMEOUT_MS = Math.max(
  5000,
  parseInt(optionalEnv("WAVEFORM_TIMEOUT_MS", "60000"), 10) || 60000,
);
const FORCE = process.argv.includes("--force");

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

/** Applica un timeout a una promise. */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timeout dopo ${ms} ms (${label})`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function main() {
  console.log(`[waveforms] start ${timestamp()}`);
  console.log(`[waveforms] MUSIC_DIR=${MUSIC_DIR}`);
  console.log(`[waveforms] WAVEFORMS_DIR=${waveformsDir()}`);
  console.log(`[waveforms] mode=${FORCE ? "force (ricalcola tutto)" : "solo mancanti"}`);

  fs.mkdirSync(waveformsDir(), { recursive: true });
  const prisma = makePrisma();

  try {
    const tracks = await prisma.track.findMany({
      select: { id: true, filePath: true, title: true, artist: true },
      orderBy: { id: "asc" },
    });

    const pending = FORCE
      ? tracks
      : tracks.filter((t) => !fs.existsSync(waveformFileFor(t.id)));

    if (pending.length === 0) {
      console.log("[waveforms] nessun brano da elaborare");
      return;
    }

    console.log(`[waveforms] ${pending.length} brano/i da elaborare`);

    let ok = 0;
    let failed = 0;

    for (const track of pending) {
      const label = `${track.title} (${track.artist})`;
      try {
        // Difesa path traversal: il file audio deve stare dentro MUSIC_DIR.
        const filePath = ensureInside(MUSIC_DIR, track.filePath);
        if (!fs.existsSync(filePath)) {
          throw new Error(`file non trovato: ${filePath}`);
        }

        const t0 = Date.now();
        const { peaks, durationSeconds } = await withTimeout(
          computeWaveform(filePath),
          TIMEOUT_MS,
          label,
        );
        const ms = Date.now() - t0;

        const out = waveformFileFor(track.id);
        fs.writeFileSync(out, serializeWaveform(peaks), "utf8");

        ok++;
        console.log(
          `[waveforms] ✓ ${label} — ${peaks.length} bucket, ${durationSeconds.toFixed(1)}s, ${ms} ms`,
        );
      } catch (err) {
        failed++;
        console.warn(`[waveforms] ✗ ${label}: ${err.message ?? err}`);
        // Un brano fallito non deve fermare gli altri.
      }
    }

    console.log(
      `[waveforms] done — ${ok} ok, ${failed} falliti (${timestamp()})`,
    );
    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[waveforms] errore fatale:", err);
  process.exit(1);
});
