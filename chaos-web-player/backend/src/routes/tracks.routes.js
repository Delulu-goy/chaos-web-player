// Chaos Radio — Tracks routes
// GET /api/tracks                 (auth) — tutti i brani ordinati per addedAt desc
// GET /api/tracks/:id             (auth) — singolo brano
// GET /api/tracks/:id/stream      (auth) — audio/mpeg con Accept-Ranges
// GET /api/tracks/:id/cover       (auth) — cover image
// GET /api/tracks/:id/waveform    (auth) — picchi del brano (base64)

import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import prisma from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { streamRateLimit } from "../middleware/rateLimit.js";
import { HttpError } from "../middleware/error.js";
import { waveformFileFor } from "../lib/waveformStore.js";

const router = Router();

// __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tutte le route richiedono auth
router.use(requireAuth);

// GET /api/tracks — lista completa
router.get("/", async (req, res, next) => {
  try {
    const tracks = await prisma.track.findMany({
      orderBy: { addedAt: "desc" },
    });
    res.json(tracks);
  } catch (err) {
    next(err);
  }
});

// GET /api/tracks/:id — singolo brano
router.get("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      throw new HttpError(400, "validation", { field: "id" });
    }
    const track = await prisma.track.findUnique({ where: { id } });
    if (!track) {
      throw new HttpError(404, "not_found");
    }
    res.json(track);
  } catch (err) {
    next(err);
  }
});

// GET /api/tracks/:id/stream — file audio
//
// NOTA: si usa res.sendFile() e NON fs.createReadStream().pipe(res).
// sendFile (wrapper di `send`) gestisce nativamente:
//   - le Range request → risponde 206 + Content-Range invece di 200 col file intero
//   - ETag / Last-Modified (cache/validazione condizionale del browser)
//   - la chiusura dello stream quando il CLIENT ABBATTE la connessione
//     (succede a ogni seek: senza questo, il server continua a leggere
//     il file da disco e a scrivere in un socket morto)
// Con createReadStream il server dichiarava `Accept-Ranges: bytes` ma
// ignorava l'header Range: ogni seek riscaricava l'intero MP3.
router.get("/:id/stream", streamRateLimit, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      throw new HttpError(400, "validation", { field: "id" });
    }
    const track = await prisma.track.findUnique({ where: { id } });
    if (!track) {
      throw new HttpError(404, "not_found");
    }

    if (!fs.existsSync(track.filePath)) {
      throw new HttpError(404, "not_found");
    }

    res.sendFile(
      path.resolve(track.filePath),
      {
        acceptRanges: true,
        cacheControl: "private, max-age=3600",
        dotfiles: "deny",
        headers: { "Content-Type": "audio/mpeg" },
      },
      (err) => {
        // Se il client ha abortito, gli header sono già partiti e non
        // c'è più nulla da rispondere: non chiamare next() altrimenti
        // Express tenta una seconda risposta su una connessione chiusa.
        if (err && !res.headersSent) {
          next(err);
        }
      },
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/tracks/:id/cover — immagine cover
router.get("/:id/cover", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      throw new HttpError(400, "validation", { field: "id" });
    }
    const track = await prisma.track.findUnique({ where: { id } });
    if (!track || !track.coverPath) {
      throw new HttpError(404, "not_found");
    }

    if (!fs.existsSync(track.coverPath)) {
      throw new HttpError(404, "not_found");
    }

    res.sendFile(path.resolve(track.coverPath));
  } catch (err) {
    next(err);
  }
});

// GET /api/tracks/:id/waveform — picchi del brano per il player
//
// Restituisce 300 byte di picchi (0-255) serializzati in base64, cioè la
// "forma d'onda" del brano. Il file è generato dallo scan con il decoder
// WASM mpg123 (su Stellar non c'è ffmpeg) e non cambia mai.
//
// 404 se il brano non ha ancora la waveform (non ancora calcolata).
router.get("/:id/waveform", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      throw new HttpError(400, "validation", { field: "id" });
    }
    const track = await prisma.track.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!track) {
      throw new HttpError(404, "not_found");
    }

    const file = waveformFileFor(id);
    if (!fs.existsSync(file)) {
      throw new HttpError(404, "not_found");
    }

    res.setHeader("Cache-Control", "private, max-age=3600");
    res.json({ waveform: fs.readFileSync(file, "utf8") });
  } catch (err) {
    next(err);
  }
});

export default router;