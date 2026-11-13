// Chaos Radio — Playlists routes
// GET /api/playlists/show-list    (auth) — playlist principale
// GET /api/playlists/pirate-day   (auth) — playlist pirate day corrente

import { Router } from "express";
import prisma from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { isPirateDayPath, pirateDayTrackIds } from "../lib/pirateDay.js";

const router = Router();

router.use(requireAuth);

// GET /api/playlists/show-list
//
// I brani del Pirate Day NON devono mai comparire qui (invariante I1).
// Il filtro è doppio:
//   (a) per PATH  — il file del brano è dentro PIRATE_DAY_DIR;
//   (b) per DATI  — il brano è referenziato da una playlist PIRATE_DAY
//       (copre playlist_items inquinati a mano e resta valido anche se
//       la cartella cambia tra un deploy e l'altro).
router.get("/show-list", async (req, res, next) => {
  try {
    const playlist = await prisma.playlist.findUnique({
      where: { slug: "show-list" },
      include: {
        items: {
          include: { track: true },
          orderBy: { position: "asc" },
        },
      },
    });
    if (!playlist) {
      // Non inizializzata: array vuoto invece di 404 per non rompere il frontend
      return res.json({ title: "Show List", items: [] });
    }

    const pirateDayIds = await pirateDayTrackIds();
    const items = playlist.items
      .map((i) => i.track)
      .filter((t) => !isPirateDayPath(t.filePath) && !pirateDayIds.has(t.id));

    res.json({
      title: playlist.title,
      items,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/playlists/pirate-day
// Restituisce la playlist PIRATE_DAY attualmente attiva (endsAt > now).
// Se ce ne sono più, prende la più recente (startsAt desc). Se nessuna
// attiva, restituisce 404.
router.get("/pirate-day", async (req, res, next) => {
  try {
    const now = new Date();
    const playlist = await prisma.playlist.findFirst({
      where: {
        kind: "PIRATE_DAY",
        endsAt: { gt: now },
      },
      include: {
        items: {
          include: { track: true },
          orderBy: { position: "asc" },
        },
      },
      orderBy: { startsAt: "desc" },
    });

    if (!playlist) {
      throw new HttpError(404, "not_found");
    }

    res.json({
      title: playlist.title,
      curator: {
        name: playlist.curatorName,
        role: playlist.curatorRole,
        avatar: playlist.curatorAvatar,
        links: playlist.curatorLinks,
      },
      description: playlist.description,
      startsAt: playlist.startsAt,
      endsAt: playlist.endsAt,
      items: playlist.items.map((i) => i.track),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
