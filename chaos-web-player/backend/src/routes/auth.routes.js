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
import { HttpError } from "../middleware/error.js";

const router = Router();

const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 8;
const COOKIE_NAME = "token";

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

// ── POST /api/auth/register ────────────────────────────────────────
router.post("/register", async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body ?? {};

    if (!email || typeof email !== "string" || !email.includes("@")) {
      throw new HttpError(400, "validation", { field: "email" });
    }
    if (!password || typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      throw new HttpError(400, "validation", {
        field: "password",
        message: `Minimo ${MIN_PASSWORD_LENGTH} caratteri`,
      });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        passwordHash,
        displayName: displayName?.trim() || null,
      },
    });

    const token = signToken({ userId: user.id, email: user.email });
    setAuthCookie(res, token);

    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/login ────────────────────────────────────────────
router.post("/login", async (req, res, next) => {
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

    const token = signToken({ userId: found.id, email: found.email });
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
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });
    if (!user) {
      throw new HttpError(401, "unauthorized");
    }
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

export default router;