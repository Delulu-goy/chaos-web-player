// Chaos Radio — Helpers condivisi per gli script CLI (scan, seed, smoke-test).
//
//  - loadEnv(): carica backend/.env in process.env senza dipendere da dotenv
//    (utile per script one-shot che girano anche fuori da cPanel).
//  - requireEnv / optionalEnv: lettura tipata con errore chiaro se manca.
//  - makePrisma(): istanza Prisma 7 con driver adapter MariaDB (analogo
//    a src/db.js, ma esplicito per gli script che NON importano src/db).
//  - timestamp(), sanitizePath(): utility logging + path safety.

import fs from "node:fs";
import path from "node:path";

/**
 * Carica il file .env dalla CWD in process.env se presente.
 * Non sovrascrive env esistenti (per non rompere le env impostate in CI/cPanel).
 * Supporta righe vuote, commenti `#`, e valori opzionalmente tra virgolette.
 */
export function loadEnv(filename = ".env") {
  const envPath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(envPath)) {
    return false;
  }
  const text = fs.readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/i.exec(line);
    if (!m) continue;
    const [, key, rawValue] = m;
    const value = rawValue.trim().replace(/^["'](.*)["']$/, "$1");
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return true;
}

export function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Env var richiesta mancante: ${name}. ` +
        `Impostala nel .env o esportala prima di lanciare lo script.`,
    );
  }
  return v;
}

export function optionalEnv(name, fallback = undefined) {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

/**
 * Risolve una directory env-driven.
 * - Se env non settato, usa fallback.
 * - Crea la cartella (recursive) se non esiste (idempotente).
 * - Lancia se è un file regolare (non directory).
 */
export function resolveDir(name, fallback) {
  const raw = optionalEnv(name, fallback);
  if (!raw) {
    throw new Error(`Env var ${name} non configurata e nessun fallback fornito`);
  }
  const abs = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  if (fs.existsSync(abs)) {
    const stat = fs.statSync(abs);
    if (!stat.isDirectory()) {
      throw new Error(`Path ${abs} esiste ma non è una directory`);
    }
  } else {
    fs.mkdirSync(abs, { recursive: true });
  }
  return abs;
}

export function timestamp() {
  return new Date().toISOString();
}

/**
 * Verifica che un path risolto sia dentro una directory consentita.
 * Usato come difesa in profondità quando un path viene letto da DB o
 * da input utente, prima di operazioni su filesystem.
 */
export function ensureInside(root, candidate) {
  const absRoot = path.resolve(root);
  const absCandidate = path.resolve(candidate);
  const rel = path.relative(absRoot, absCandidate);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Path fuori da ${absRoot}: ${absCandidate}`);
  }
  return absCandidate;
}
