// Chaos Radio — Favorites routes
// GET    /api/favorites           (auth) — lista preferiti utente corrente
// POST   /api/favorites/:trackId  (auth) — aggiungi
// DELETE /api/favorites/:trackId  (auth) — rimuovi

import { Router } from "express";
import prisma from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { isPirateDayTrack, pirateDayTrackIds } from "../lib/pirateDay.js";

const router = Router();

router.use(requireAuth);

// GET /api/favorites
//
// I brani del Pirate Day non sono preferitabili (invariante I3): vengono
// filtrati anche in lettura, così i preferiti messi PRIMA della regola
// (o inseriti a mano) spariscono.
router.get("/", async (req, res, next) => {
  try {
    const favorites = await prisma.favorite.findMany({
      where: { userId: req.user.id },
      include: { track: true },
      orderBy: { createdAt: "desc" },
    });
    const pirateDayIds = await pirateDayTrackIds();
    // Restituiamo solo l'oggetto track (frontend si aspetta [Track])
    res.json(
      favorites.map((f) => f.track).filter((t) => !pirateDayIds.has(t.id)),
    );
  } catch (err) {
    next(err);
  }
});

// POST /api/favorites/:trackId
router.post("/:trackId", async (req, res, next) => {
  try {
    const trackId = parseInt(req.params.trackId, 10);
    if (Number.isNaN(trackId)) {
      throw new HttpError(400, "validation", { field: "trackId" });
    }

    // Verifica che il track esista
    const track = await prisma.track.findUnique({ where: { id: trackId } });
    if (!track) {
      throw new HttpError(404, "not_found");
    }

    // I brani del Pirate Day non si possono salvare nei preferiti.
    // Il frontend nasconde il cuore, ma la regola va garantita qui:
    // richiesta diretta o client PWA vecchio passerebbero.
    if (await isPirateDayTrack(trackId)) {
      throw new HttpError(403, "forbidden");
    }

    // create o no-op se esiste già (P2002 = unique violation, ignorata)
    await prisma.favorite
      .create({
        data: { userId: req.user.id, trackId },
      })
      .catch((err) => {
        if (err.code !== "P2002") throw err;
      });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// DELETE /api/favorites/:trackId
router.delete("/:trackId", async (req, res, next) => {
  try {
    const trackId = parseInt(req.params.trackId, 10);
    if (Number.isNaN(trackId)) {
      throw new HttpError(400, "validation", { field: "trackId" });
    }

    // deleteMany non fallisce se non trova record
    await prisma.favorite.deleteMany({
      where: { userId: req.user.id, trackId },
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
