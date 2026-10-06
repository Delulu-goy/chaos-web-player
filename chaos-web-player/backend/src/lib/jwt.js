// Chaos Radio — JWT helpers (sign + verify)

import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = "30d";

if (!SECRET) {
  throw new Error(
    "JWT_SECRET non configurato. Aggiungi una stringa casuale di almeno 32 caratteri nel file .env"
  );
}

/**
 * Genera un JWT firmato HS256.
 * @param {{ userId: number, email: string }} payload
 * @returns {string} token
 */
export function signToken(payload) {
  return jwt.sign(payload, SECRET, {
    algorithm: "HS256",
    expiresIn: EXPIRES_IN,
  });
}

/**
 * Verifica e decodifica un JWT. Ritorna null se invalido/scaduto.
 * @param {string} token
 * @returns {{ userId: number, email: string, iat: number, exp: number } | null}
 */
export function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, SECRET, { algorithms: ["HS256"] });
  } catch {
    return null;
  }
}