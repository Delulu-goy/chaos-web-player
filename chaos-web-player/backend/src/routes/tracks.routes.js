// Chaos Radio — Tracks routes
// GET /api/tracks                 (auth) — tutti i brani ordinati per addedAt desc
// GET /api/tracks/:id             (auth) — singolo brano
// GET /api/tracks/:id/stream      (auth) — audio/mpeg con Accept-Ranges
// GET /api/tracks/:id/cover       (auth) — cover image

import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import prisma from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";

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
router.get("/:id/stream", async (req, res, next) => {
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

    const stat = fs.statSync(track.filePath);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, max-age=3600");

    fs.createReadStream(track.filePath).pipe(res);
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

export default router;