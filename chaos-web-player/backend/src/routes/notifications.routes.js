// Chaos Radio — Notifications routes
// GET  /api/notifications          (auth) — lista notifiche utente + broadcast non lette
// POST /api/notifications/:id/read (auth) — marca come letta

import { Router } from "express";
import prisma from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";

const router = Router();

router.use(requireAuth);

// GET /api/notifications
// Mostra le notifiche rilevanti per l'utente:
//  - quelle broadcast (userId null) non ancora lette da questo utente
//  - tutte le notifiche target (userId = me) ordinate per createdAt desc
router.get("/", async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Notifiche broadcast (userId null) lette da questo utente
    const broadcastReadIds = await prisma.notificationRead.findMany({
      where: { userId },
      select: { notificationId: true },
    });
    const readIds = new Set(broadcastReadIds.map((r) => r.notificationId));

    // Notifiche visibili: broadcast non lette OPPURE target per me
    const visible = await prisma.notification.findMany({
      where: {
        OR: [{ userId: null }, { userId }],
      },
      orderBy: { createdAt: "desc" },
    });

    // Marca ciascuna come letta o no
    const result = visible
      .filter((n) => {
        // broadcast: mostra se non letta
        if (n.userId === null) return !readIds.has(n.id);
        // target: sempre relativa
        return true;
      })
      .map((n) => ({
        id: n.id,
        body: n.body,
        createdAt: n.createdAt,
        read: n.userId !== null ? true : readIds.has(n.id),
      }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/:id/read
router.post("/:id/read", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      throw new HttpError(400, "validation", { field: "id" });
    }

    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification) {
      throw new HttpError(404, "not_found");
    }

    // Crea un record di lettura (no-op se esiste già grazie al vincolo PK)
    await prisma.notificationRead
      .create({
        data: { notificationId: id, userId: req.user.id },
      })
      .catch((err) => {
        if (err.code !== "P2002") throw err;
      });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;