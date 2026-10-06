// Chaos Radio — Global error handler
// Express lo vede come (err, req, res, next) grazie ai 4 argomenti.

import { Prisma } from "../../generated/prisma/client.ts";

/**
 * Errore applicativo "taggato" lanciabile da qualsiasi route.
 * Il middleware lo riconosce e produce la risposta JSON standard.
 *
 * Esempio: throw new HttpError(404, "not_found");
 */
export class HttpError extends Error {
  constructor(status, code, details) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function errorHandler(err, req, res, _next) {
  // Errori app lanciati esplicitamente
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: err.code,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // Errori Prisma conosciuti
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({
        error: "conflict",
        details: { target: err.meta?.target },
      });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: "not_found" });
    }
  }

  // Tutto il resto: log + 500 generico
  console.error("[unhandled error]", err);
  res.status(500).json({ error: "internal" });
}