// Chaos Radio — Percorsi dei file waveform
//
// La waveform di un brano (300 byte di picchi, base64) è salvata come file
// in `private/waveforms/waveform-<trackId>.txt`, accanto alle cover.
//
// Perché un file e non una colonna nel DB:
//   - Stellar non ha terminale, e `prisma migrate deploy` su quel hosting è
//     inaffidabile (stesso problema del client WASM di Prisma 7). Una
//     migrazione non applicata che aggiunge una colonna a `tracks` farebbe
//     fallire TUTTE le query sui brani → l'app intera giù.
//   - Il file è generato una volta sola e non cambia mai: nessun vantaggio
//     a metterlo nel DB.
//
// Il percorso è derivato dal trackId, quindi non serve nessuna colonna.

import path from "node:path";

/** Directory delle waveform. Allineata a COVERS_DIR/.. del layout Stellar. */
export function waveformsDir() {
  const raw =
    process.env.WAVEFORMS_DIR ||
    path.resolve(process.cwd(), "private/waveforms");
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

/** Percorso del file waveform di un brano. */
export function waveformFileFor(trackId) {
  return path.join(waveformsDir(), `waveform-${trackId}.txt`);
}
