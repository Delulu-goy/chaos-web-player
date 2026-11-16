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
  // Client che abbandona la richiesta (seek audio, chiusura della tab,
  // cambio brano): NON è un errore del server. Senza questo filtro lo
  // stderr.log si riempie di "[unhandled error] Request aborted" e
  // nasconde i problemi veri.
  if (
    err?.code === "ECONNABORTED" ||
    err?.type === "aborted" ||
    err?.message === "Request aborted"
  ) {
    if (!res.headersSent) res.destroy();
    return;
  }

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

  // Errori 4xx che portano già con sé il loro status (body parser:
  // JSON malformato → 400, payload troppo grande → 413; anche i 429 dei
  // rate limiter). Rispondere 500 sarebbe bugiardo: è colpa del client,
  // non del server, e il client ha bisogno del vero codice per capire
  // cosa correggere.
  const status = err.status ?? err.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return res.status(status).json({
      error: status === 413 ? "payload_too_large" : "validation",
    });
  }

  // Tutto il resto: log + 500 generico
  console.error("[unhandled error]", err);
  res.status(500).json({ error: "internal" });
}