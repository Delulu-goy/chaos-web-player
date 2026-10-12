// Chaos Radio — Express entry point

// Le env vars sono fornite da cPanel Application Manager (process.env).
// In locale (.env) si possono caricare con `node --env-file=.env ...`.

// MARKER per verificare che Passenger abbia ricaricato il file
console.log("[chaos-radio] Boot v2026-10-12-FINAL-FIX pid=" + process.pid + " node=" + process.version);

import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";

import { authRateLimit } from "./middleware/rateLimit.js";
import { errorHandler } from "./middleware/error.js";

import authRoutes from "./routes/auth.routes.js";
import tracksRoutes from "./routes/tracks.routes.js";
import favoritesRoutes from "./routes/favorites.routes.js";
import playlistsRoutes from "./routes/playlists.routes.js";
import notificationsRoutes from "./routes/notifications.routes.js";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

// MARKER per verificare che Passenger abbia ricaricato il file
console.log("[chaos-radio] Boot v2026-10-12-FINAL-FIX pid=" + process.pid + " node=" + process.version);

// Debug endpoint: ci dice esattamente cosa sta girando
app.get("/api/debug", (req, res) => {
  res.json({
    pid: process.pid,
    node: process.version,
    uptime: process.uptime(),
    env_check: {
      DB_HOST: process.env.DB_HOST ?? "MISSING",
      DB_USER: process.env.DB_USER ?? "MISSING",
      DB_NAME: process.env.DB_NAME ?? "MISSING",
      DB_PORT: process.env.DB_PORT ?? "MISSING",
      JWT_SECRET: process.env.JWT_SECRET ? "set (" + process.env.JWT_SECRET.length + " chars)" : "MISSING",
      NODE_ENV: process.env.NODE_ENV ?? "MISSING",
      PORT: process.env.PORT ?? "MISSING",
    },
    cwd: process.cwd(),
  });
});

// Trust proxy (necessario per correttamente interpretare X-Forwarded-* dietro reverse proxy)
// In dev siamo diretti, su Stellar cPanel gestisce proxy. trust proxy = 1 è safe.
app.set("trust proxy", 1);

// Helmet — CSP rilassato in dev, più stretto in prod
app.use(
  helmet({
    contentSecurityPolicy: false, // disabilitato: il frontend è servito da un altro dominio, non ha senso applicarlo qui
    crossOriginResourcePolicy: { policy: "cross-origin" }, // necessario per stream audio cross-origin
  })
);

// CORS — in dev accettiamo il frontend Vite su :5173
const ALLOWED_ORIGINS =
  process.env.NODE_ENV === "production"
    ? ["https://radio.chaosroom.online"]
    : ["http://localhost:5173", "http://127.0.0.1:5173"];

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: true, // necessario per cookie httpOnly
  })
);

// Body parser + cookie parser
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Health check (pubblico, no auth)
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Auth routes — login/register protetti da rate limit
app.use("/api/auth", authRateLimit, authRoutes);

// Rotte protette
app.use("/api/tracks", tracksRoutes);
app.use("/api/favorites", favoritesRoutes);
app.use("/api/playlists", playlistsRoutes);
app.use("/api/notifications", notificationsRoutes);

// 404 per qualsiasi altro /api/*
app.use("/api", (req, res) => {
  res.status(404).json({ error: "not_found" });
});

// ── Frontend static serving (solo in produzione) ──────────────────
// In dev Vite serve il frontend su :5173; in prod il backend serve i
// file statici pre-buildati da chaos-web-player/frontend/dist/
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIST = path.resolve(__dirname, "../../frontend/dist");

if (process.env.NODE_ENV === "production") {
  app.use(
    express.static(FRONTEND_DIST, {
      maxAge: "1y",
      immutable: true,
      setHeaders: (res, path) => {
        // Service worker e index.html non devono essere cachati
        if (path.endsWith("index.html") || path.endsWith("sw.js") || path.includes("workbox-")) {
          res.setHeader("Cache-Control", "no-cache, must-revalidate");
        }
      },
    })
  );

  // SPA fallback: ogni rotta non-API che non è un file statico → index.html
  app.get(/^\/(?!api\/).*/, (req, res, next) => {
    res.sendFile(path.join(FRONTEND_DIST, "index.html"), (err) => {
      if (err) next(err);
    });
  });
}

// Global error handler (DEVE essere l'ultimo middleware)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[chaos-radio] backend in ascolto su http://localhost:${PORT}`);
  console.log(`[chaos-radio] ambiente: ${process.env.NODE_ENV ?? "development"}`);
});