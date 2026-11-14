// Chaos Radio — Quale codice sta girando?
//
// Dopo un deploy è SEMPRE stato possibile che il frontend fosse aggiornato
// e il backend no: le due copie del codice vivevano in cartelle diverse
// (vedi deploy/DEPLOY.md, "due copie del backend"). Il sintomo era
// invisibile: il fix del backend semplicemente "non c'era".
//
// Questo modulo espone il SHA del commit in esecuzione, così il stato
// del deploy si verifica con una sola chiamata:
//   curl -s https://radio.chaosroom.online/api/debug
// → "git": { "sha": "a5529d3", "source": "git" }
//
// Priorità:
//   1. env var DEPLOY_SHA (impostabile dalla pipeline, non richiede git)
//   2. `git rev-parse --short HEAD` nella cartella dell'app
//   3. null (git non disponibile / non è un clone)

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * SHA (breve) del commit attualmente in esecuzione.
 *
 * @param {string} [cwd] cartella da cui eseguire git (default: cwd del processo)
 * @param {number} [timeoutMs] timeout del comando git
 * @returns {Promise<{sha: string|null, source: string}>}
 */
export async function deployedCommitSha(cwd = process.cwd(), timeoutMs = 2000) {
  const fromEnv = (process.env.DEPLOY_SHA ?? "").trim();
  if (fromEnv) {
    return { sha: fromEnv, source: "env" };
  }

  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"], {
      cwd,
      timeout: timeoutMs,
      windowsHide: true,
    });
    const sha = stdout.trim();
    return sha ? { sha, source: "git" } : { sha: null, source: "none" };
  } catch {
    // git non c'è, la cartella non è un clone, o il timeout è scaduto:
    // non è un errore fatale, si degrada senza informazioni.
    return { sha: null, source: "none" };
  }
}
