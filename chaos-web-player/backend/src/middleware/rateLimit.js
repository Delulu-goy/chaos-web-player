// Chaos Radio — Rate limit su /auth/*
// 5 richieste ogni 15 minuti per IP, per mitigare brute force su login/register.

import rateLimit from "express-rate-limit";

// In development, increase limit to avoid blocking manual checks
const DEV_MAX = process.env.NODE_ENV === "production" ? 5 : 100;

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: DEV_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "rate_limited",
    details: { retryAfterMinutes: 15 },
  },
});