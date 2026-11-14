// Chaos Radio — Rate limit su /auth/*
// 5 richieste ogni 15 minuti per IP, per mitigare brute force su login/register.

import rateLimit from "express-rate-limit";

// In development, increase limit to avoid blocking manual checks
const DEV_MAX = process.env.NODE_ENV === "production" ? 5 : 100;

// Limite configurabile via env var.
//
// Il default (5/15min per IP) è volutamente stretto: sullo stesso IP
// (NAT, operatore mobile) più utenti condividono la quota. Ma lo smoke
// test E2E fa 7 richieste /auth/* (registrazione + login + casi limite)
// e con 5 fallirebbe SEMPRE per rate limit, non per un bug.
//
// Per usarlo in produzione: AUTH_RATE_LIMIT_MAX=20 nel pannello env vars
// (oppure attendere la fine della finestra di 15 minuti).
const AUTH_MAX = parseInt(process.env.AUTH_RATE_LIMIT_MAX ?? "", 10) || DEV_MAX;

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: AUTH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "rate_limited",
    details: { retryAfterMinutes: 15 },
  },
});

/**
 * Rate limit sulle route di streaming audio.
 *
 * Ogni seek dell'utente è una nuova richiesta HTTP sul file (il browser
 * abbatte la precedente e riapre una Range request). Senza un limite, un
 * utente che clicca ripetutamente sulla waveform può saturare il server
 * con decine di trasferimenti concorrenti.
 *
 * 120 req/min per IP è ampio per l'uso normale (un utente umano fatica a
 * superare 30 seek/min) ma blocca i loop automatici. In dev il limite è
 * molto più alto per non falsare i test manuali.
 */
const STREAM_MAX = process.env.NODE_ENV === "production" ? 120 : 1000;

export const streamRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  limit: STREAM_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "rate_limited",
    details: { retryAfterSeconds: 60 },
  },
});