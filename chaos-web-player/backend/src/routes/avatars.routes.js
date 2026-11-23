// Chaos Radio — Avatars routes
// GET /api/avatars/:file — avatar del curatore del Pirate Day
//
// Rotta PUBBLICA (nessun requireAuth): un avatar non è un dato riservato e
// deve caricare in un <img> anche quando la sessione è scaduta o non esiste
// (il frontend lo rende come src diretto).
//
// Sicurezza: il nome del file passa per una whitelist stretta
// (`curator-<edizione>.<ext>`) → niente slash, niente `..`, niente path
// traversal. Un 404 esplicito (`avatar_not_found`) distingue "file non
// c'è" dal catch-all generico dell'API (`not_found`): utile per capire se
// la rotta è montata.

import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { avatarFileFor, isValidAvatarName } from "../lib/avatarStore.js";

const router = Router();

router.get("/:file", (req, res) => {
  const name = req.params.file;

  if (!isValidAvatarName(name)) {
    return res.status(404).json({ error: "avatar_not_found" });
  }

  const abs = path.resolve(avatarFileFor(name));
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return res.status(404).json({ error: "avatar_not_found" });
  }

  // Cache breve: il nome cambia a ogni edizione (curator-<n>.<ext>), quindi
  // un giorno di cache non lascia mai a schermo l'avatar dell'edizione
  // precedente.
  res.sendFile(abs, {
    cacheControl: "public, max-age=86400",
    dotfiles: "deny",
  });
});

export default router;
