// Chaos Radio — Notifications routes
// GET    /api/notifications?page=0&limit=20  (auth) — storico notifiche + conteggio non lette
// POST   /api/notifications                  (auth + admin) — crea una notifica custom
// POST   /api/notifications/read-all         (auth) — marca come lette tutte le notifiche visibili
// POST   /api/notifications/:id/read         (auth) — marca come letta una singola notifica
// DELETE /api/notifications/:id              (auth + admin) — elimina una notifica
//
// Le notifiche non spariscono più: una volta lette restano nella lista
// (in grigio) e fanno da storico. Lo stato "letto" è per utente
// (tabella `notification_reads`).

import { Router } from "express";
import prisma from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import { notificationsRateLimit } from "../middleware/rateLimit.js";
import { HttpError } from "../middleware/error.js";

const router = Router();

router.use(requireAuth);

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_BODY_LENGTH = 2000;
const MAX_TITLE_LENGTH = 120;

/**
 * Notifiche visibili all'utente: broadcast (userId null) + target a lui.
 */
function visibleWhere(userId) {
  return { OR: [{ userId: null }, { userId }] };
}

// GET /api/notifications
// Storico completo, dal più recente al più vecchio, paginato.
// `unreadCount` viene calcolato dal server: con la paginazione non
// può essere derivato dal client (che vede solo la pagina caricata).
router.get("/", async (req, res, next) => {
  try {
    const userId = req.user.id;

    const page = Math.max(0, parseInt(req.query.page ?? "0", 10) || 0);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(req.query.limit ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
    );

    const [total, unreadCount, rows] = await Promise.all([
      prisma.notification.count({ where: visibleWhere(userId) }),
      prisma.notification.count({
        where: {
          AND: [visibleWhere(userId), { reads: { none: { userId } } }],
        },
      }),
      prisma.notification.findMany({
        where: visibleWhere(userId),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: page * limit,
        take: limit,
        include: {
          reads: { where: { userId }, select: { readAt: true } },
        },
      }),
    ]);

    const items = rows.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      kind: n.kind,
      createdAt: n.createdAt,
      read: n.reads.length > 0,
      readAt: n.reads[0]?.readAt ?? null,
      meta: n.meta ?? null,
    }));

    res.json({ items, total, page, limit, unreadCount });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications
// Creazione di una notifica custom (solo admin).
// - `body` obbligatorio (1..2000 caratteri)
// - `title` opzionale (max 120 caratteri)
// - `userId` opzionale: null/omesso = broadcast, un id = notifica target
// - `dedupeKey` opzionale: rende la creazione idempotente
router.post("/", notificationsRateLimit, requireAdmin, async (req, res, next) => {
  try {
    const payload = req.body ?? {};

    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    if (!body) {
      throw new HttpError(400, "validation", { field: "body" });
    }
    if (body.length > MAX_BODY_LENGTH) {
      throw new HttpError(400, "validation", { field: "body" });
    }

    const title =
      payload.title == null ? null : String(payload.title).trim() || null;
    if (title && title.length > MAX_TITLE_LENGTH) {
      throw new HttpError(400, "validation", { field: "title" });
    }

    // Destinatario: null = broadcast, altrimenti un utente specifico.
    let userId = null;
    if (payload.userId !== null && payload.userId !== undefined && payload.userId !== "") {
      userId = parseInt(payload.userId, 10);
      if (Number.isNaN(userId)) {
        throw new HttpError(400, "validation", { field: "userId" });
      }
      const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!target) {
        throw new HttpError(404, "not_found");
      }
    }

    const dedupeKey =
      payload.dedupeKey == null ? null : String(payload.dedupeKey).trim() || null;
    if (dedupeKey) {
      const existing = await prisma.notification.findUnique({
        where: { dedupeKey },
        select: { id: true },
      });
      if (existing) {
        throw new HttpError(409, "conflict", { field: "dedupeKey" });
      }
    }

    const notification = await prisma.notification.create({
      data: {
        title,
        body,
        kind: "CUSTOM",
        userId,
        meta: payload.meta ?? null,
        dedupeKey,
      },
    });

    res.status(201).json({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      kind: notification.kind,
      createdAt: notification.createdAt,
      read: false,
      meta: notification.meta ?? null,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/read-all
// Il solo fatto di visitare la pagina notifiche marca come lette tutte
// le notifiche visibili (non solo quelle della pagina caricata: qui si
// marcano TUTTE, così lo storico non si "spalma" su più visite).
router.post("/read-all", async (req, res, next) => {
  try {
    const userId = req.user.id;

    const visible = await prisma.notification.findMany({
      where: visibleWhere(userId),
      select: { id: true },
    });

    if (visible.length > 0) {
      // skipDuplicates: le già lette vengono ignorate (PK [notificationId, userId]).
      await prisma.notificationRead.createMany({
        data: visible.map((n) => ({ notificationId: n.id, userId })),
        skipDuplicates: true,
      });
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// DELETE /api/notifications/:id
// Rimuove una notifica (solo admin): serve a cancellare un annuncio
// sbagliato. Le letture collegate cascade via la FK.
router.delete("/:id", notificationsRateLimit, requireAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      throw new HttpError(400, "validation", { field: "id" });
    }

    const existing = await prisma.notification.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new HttpError(404, "not_found");
    }

    await prisma.notification.delete({ where: { id } });
    res.status(204).end();
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
    // Una notifica target di un altro utente non è "vista" da chi chiama.
    if (notification.userId !== null && notification.userId !== req.user.id) {
      throw new HttpError(403, "forbidden");
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
