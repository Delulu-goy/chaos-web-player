// Chaos Radio — Percorsi dei file avatar (curatore del Pirate Day)
//
// L'avatar del curatore è un file in `private/avatars/`, servito da
// `GET /api/avatars/:file`.
//
// Come per le waveform: un file, non una colonna del DB. Stellar non ha
// terminale e `prisma migrate deploy` su quel hosting è inaffidabile
// (stesso problema del client WASM di Prisma 7): una migration non
// applicata che toccherebbe `tracks` farebbe fallire TUTTE le query sui
// brani → l'app intera giù. Un file derivato si rigenera e basta.
//
// Nel DB (`playlists.curator_avatar`) basta la URL: il percorso del file
// è derivato dal nome, che segue il pattern `curator-<edizione>.<ext>`.
// Ogni edizione ha un nome proprio → niente cache stantia nel browser.

import path from "node:path";

/** Directory degli avatar. Allineata a WAVEFORMS_DIR/.. del layout Stellar. */
export function avatarsDir() {
  const raw =
    process.env.AVATARS_DIR ||
    path.resolve(process.cwd(), "private/avatars");
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

/**
 * Pattern dei nomi ammessi: `curator-25.jpg`.
 *
 * Whitelist stretta, non una black-list: niente slash, niente `..`, niente
 * path traversal. Un nome che non la rispetta non viene servito, anche se
 * il file esiste.
 */
const AVATAR_NAME_PATTERN = /^curator-\d+\.(png|jpe?g|webp|avif)$/i;

/** Il nome del file è un avatar valido? */
export function isValidAvatarName(name) {
  return typeof name === "string" && AVATAR_NAME_PATTERN.test(name);
}

/**
 * Percorso del file avatar a partire dal nome.
 * Il nome NON viene validato qui: usare `isValidAvatarName` prima.
 */
export function avatarFileFor(name) {
  return path.join(avatarsDir(), name);
}
