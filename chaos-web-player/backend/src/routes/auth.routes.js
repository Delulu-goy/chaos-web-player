// Chaos Radio — Auth routes
// POST /api/auth/register
// POST /api/auth/login
// POST /api/auth/logout   (richiede auth)
// GET  /api/auth/me       (richiede auth)

import { Router } from "express";
import bcrypt from "bcrypt";
import prisma from "../db.js";
import { signToken } from "../lib/jwt.js";
import { requireAuth } from "../middleware/auth.js";
import { authRateLimit } from "../middleware/rateLimit.js";
import { HttpError } from "../middleware/error.js";

const router = Router();

const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128; // limite sanità (bcrypt tronca a 72 byte già internamente)
const MAX_EMAIL_LENGTH = 254; // RFC 5321 §4.5.3.1.3
const MAX_DISPLAY_NAME_LENGTH = 64;
const COOKIE_NAME = "token";

// Regex di base per email plausibili: local-part + "@" + dominio con almeno un punto.
// Non sostituisce la validazione completa RFC 5322 ma blocca il 99% dei typo e degli
// input malformati che arrivano dai form. La validazione "vera" è il vincolo UNIQUE
// sul DB, che è source of truth.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 giorni
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
  };
}

// Helper: normalizza e valida un'email. Ritorna { ok, value, error }.
function validateEmail(raw) {
  if (typeof raw !== "string") {
    return { ok: false, error: "Inserisci un'email valida" };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_EMAIL_LENGTH) {
    return { ok: false, error: "Inserisci un'email valida" };
  }
  if (!EMAIL_RE.test(trimmed)) {
    return { ok: false, error: "Inserisci un'email valida" };
  }
  return { ok: true, value: trimmed.toLowerCase() };
}

// Helper: valida una password. Ritorna { ok, value, error }.
function validatePassword(raw) {
  if (typeof raw !== "string") {
    return { ok: false, error: `Minimo ${MIN_PASSWORD_LENGTH} caratteri` };
  }
  if (raw.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Minimo ${MIN_PASSWORD_LENGTH} caratteri` };
  }
  if (raw.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: `Massimo ${MAX_PASSWORD_LENGTH} caratteri` };
  }
  return { ok: true, value: raw };
}

// ── POST /api/auth/register ────────────────────────────────────────
router.post("/register", authRateLimit, async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body ?? {};

    const emailCheck = validateEmail(email);
    if (!emailCheck.ok) {
      throw new HttpError(400, "validation", { field: "email", message: emailCheck.error });
    }
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.ok) {
      throw new HttpError(400, "validation", {
        field: "password",
        message: passwordCheck.error,
      });
    }
    if (displayName !== undefined && displayName !== null && displayName !== "") {
      if (typeof displayName !== "string" || displayName.length > MAX_DISPLAY_NAME_LENGTH) {
        throw new HttpError(400, "validation", {
          field: "displayName",
          message: `Massimo ${MAX_DISPLAY_NAME_LENGTH} caratteri`,
        });
      }
    }

    const passwordHash = await bcrypt.hash(passwordCheck.value, BCRYPT_COST);

    const user = await prisma.user.create({
      data: {
        email: emailCheck.value,
        passwordHash,
        displayName: displayName?.trim() || null,
      },
    });

    const token = signToken({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt.toISOString(),
    });
    setAuthCookie(res, token);

    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/login ────────────────────────────────────────────
router.post("/login", authRateLimit, async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      throw new HttpError(400, "validation");
    }

    const found = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!found) {
      throw new HttpError(401, "unauthorized");
    }

    const ok = await bcrypt.compare(password, found.passwordHash);
    if (!ok) {
      throw new HttpError(401, "unauthorized");
    }

    const token = signToken({
      userId: found.id,
      email: found.email,
      displayName: found.displayName,
      createdAt: found.createdAt.toISOString(),
    });
    setAuthCookie(res, token);

    res.json({ user: publicUser(found) });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/logout ───────────────────────────────────────────
router.post("/logout", requireAuth, (req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

// ── GET /api/auth/me ────────────────────────────────────────────────
// Stateless: legge tutto dal JWT. Nessuna query DB → latenza minima e
// nessun rischio "sessione rotta" per problemi transienti di Prisma.
// Se il JWT è stato emesso prima del fix (manca displayName/createdAt),
// fa una sola query e arricchisce la risposta.
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const { id, email, displayName, createdAt } = req.user;

    if (displayName !== undefined && createdAt !== undefined) {
      return res.json({
        user: { id, email, displayName: displayName ?? null, createdAt },
      });
    }

    // Fallback per token legacy
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new HttpError(401, "unauthorized");
    }
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

export default router;