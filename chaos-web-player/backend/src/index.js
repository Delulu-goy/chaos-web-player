// Chaos Radio — Express entry point

import "dotenv/config";
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

// Global error handler (DEVE essere l'ultimo middleware)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[chaos-radio] backend in ascolto su http://localhost:${PORT}`);
  console.log(`[chaos-radio] ambiente: ${process.env.NODE_ENV ?? "development"}`);
});