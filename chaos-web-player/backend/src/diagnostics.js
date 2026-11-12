// Chaos Radio — Diagnostica ambiente di deploy
//
// Verifica quali strumenti di sistema sono disponibili sull'host. Serve per
// capire se il calcolo delle waveform lato server può usare ffmpeg oppure
// deve ricorrere a un decoder in-process.
//
// Restituisce solo presenza e versione: mai path completi, mai stdout dei
// comandi oltre la prima riga.

import { execFileSync } from "node:child_process";

/**
 * @returns {{ ffmpeg: { available: boolean, version?: string, reason?: string },
 *             ffprobe: { available: boolean, version?: string, reason?: string } }}
 */
export function probeTools() {
  return {
    ffmpeg: probeCommand("ffmpeg", ["-version"]),
    ffprobe: probeCommand("ffprobe", ["-version"]),
  };
}

function probeCommand(cmd, args) {
  try {
    const out = execFileSync(cmd, args, {
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    const first = out.toString().split("\n")[0]?.trim();
    return { available: true, version: first || "versione sconosciuta" };
  } catch (err) {
    const code = err && typeof err === "object" ? err.code : undefined;
    return {
      available: false,
      reason:
        code === "ENOENT"
          ? "non installato"
          : (code ?? String(err?.message ?? err)),
    };
  }
}
