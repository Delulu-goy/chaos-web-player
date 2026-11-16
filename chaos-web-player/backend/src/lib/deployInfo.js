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
import fs from "node:fs";
import path from "node:path";

const execFileAsync = promisify(execFile);

/**
 * SHA del commit leggendo direttamente i file di `.git`, senza il binario
 * `git`.
 *
 * Sotto Phusion Passenger il PATH è minimale: `git` non è raggiungibile e
 * l'exec fallisce, lasciando /api/debug senza SHA proprio quando serve
 * (capire quale codice gira in produzione). I file `.git/HEAD` e
 * `.git/refs/heads/<branch>` bastano, sono la stessa informazione.
 *
 * @param {string} cwd cartella dell'app (si sale finché non si trova .git)
 * @returns {string|null} SHA breve (7 caratteri) o null
 */
function readShaFromGitDir(cwd) {
  let dir = path.resolve(cwd);
  for (let i = 0; i < 4; i++) {
    const gitDir = path.join(dir, ".git");
    try {
      if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
        const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();

        // HEAD detached: contiene direttamente lo SHA
        if (/^[0-9a-f]{7,40}$/.test(head)) return head.slice(0, 7);

        if (head.startsWith("ref:")) {
          const ref = head.slice(4).trim();
          const refPath = path.join(gitDir, ...ref.split("/"));
          if (fs.existsSync(refPath)) {
            const sha = fs.readFileSync(refPath, "utf8").trim();
            if (/^[0-9a-f]{7,40}$/.test(sha)) return sha.slice(0, 7);
          }
          // ref non sballata: packed-refs
          const packed = fs.readFileSync(path.join(gitDir, "packed-refs"), "utf8");
          for (const line of packed.split("\n")) {
            const m = /^([0-9a-f]{40})\s+(.+)$/.exec(line.trim());
            if (m && m[2] === ref) return m[1].slice(0, 7);
          }
        }
        return null;
      }
    } catch {
      return null;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

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
    if (sha) return { sha, source: "git" };
  } catch {
    // git non c'è nel PATH (caso Passenger) o la cartella non è un clone:
    // si prosegue con la lettura diretta dei file .git.
  }

  const fromFiles = readShaFromGitDir(cwd);
  if (fromFiles) return { sha: fromFiles, source: "gitdir" };

  return { sha: null, source: "none" };
}
