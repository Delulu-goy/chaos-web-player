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
 * @param {{ userId: number, email: string, displayName?: string|null, createdAt?: string }} payload
 * @returns {string} token
 */
export function signToken(payload) {
  return jwt.sign(payload, SECRET, {
    algorithm: "HS256",
    expiresIn: EXPIRES_IN,
  });
}

/**
 * Verifica e decodifica un JWT. Ritorna null se invalido/scaduto o
 * se il payload non ha la forma attesa.
 * @param {string} token
 * @returns {{ userId: number, email: string, displayName?: string|null, createdAt?: string, iat: number, exp: number } | null}
 */
export function verifyToken(token) {
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, SECRET, { algorithms: ["HS256"] });
  } catch {
    return null;
  }

  // Validazione minima: protezione da token malformati / di altre app
  // che condividono lo stesso secret, o corrotti dopo un cambio di schema.
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof payload.userId !== "number" ||
    typeof payload.email !== "string"
  ) {
    return null;
  }

  // Campi opzionali ma, se presenti, devono avere il tipo giusto.
  if (
    payload.displayName !== undefined &&
    payload.displayName !== null &&
    typeof payload.displayName !== "string"
  ) {
    return null;
  }
  if (payload.createdAt !== undefined && typeof payload.createdAt !== "string") {
    return null;
  }

  return payload;
}