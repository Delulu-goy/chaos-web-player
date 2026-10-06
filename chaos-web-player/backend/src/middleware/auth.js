// Chaos Radio — Auth middleware
// Legge il JWT dal cookie httpOnly "token", verifica e popola req.user.

import { verifyToken } from "../lib/jwt.js";

/**
 * Middleware che richiede autenticazione.
 * Risponde 401 se il cookie/token manca o è invalido.
 * Altrimenti popola `req.user = { id, email }` derivato dal JWT.
 */
export function requireAuth(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "unauthorized" });
  }

  req.user = { id: payload.userId, email: payload.email };
  next();
}