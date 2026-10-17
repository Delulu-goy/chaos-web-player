# Chaos Radio — Scripts CLI

Script eseguibili da terminale, idempotenti e pensati per essere schedulati via cron / cPanel.

Tutti leggono le credenziali DB da `backend/.env` (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`).

| Script | Uso | Frequenza |
|---|---|---|
| `scan.js` | Sincronizza `tracks` dal contenuto di `private/audio/` | Ogni 5 min (cron) |
| `seed.js` | Popola DB con admin + playlist + notifiche demo | Una tantum + dopo reset |
| `smoke-test.mjs` | Verifica E2E di tutti gli endpoint | Pre-deploy, debug |

## Helpers condivisi (`_shared.mjs`)

Non è uno script eseguibile — esporta:

- `loadEnv(filename?)` — carica `.env` in `process.env` (no override di env esistenti)
- `requireEnv(name)` / `optionalEnv(name, fallback?)` — lettura tipata
- `resolveDir(name, fallback?)` — crea `mkdir -p` una directory env-driven
- `timestamp()` — ISO 8601 string
- `ensureInside(root, candidate)` — verifica anti path-traversal

Gli script `scan.js` e `seed.js` importano Prisma 7 con il driver adapter MariaDB (analogo a `src/db.js`) perché sono processi one-shot e non vogliamo che l'app Express rimanga in vita solo per loro.

## scan.js — Scanner audio

```bash
npm run scan
# equivalente a: node --env-file=.env --experimental-strip-types scripts/scan.js
```

**Cosa fa**:
1. Cerca ricorsivamente tutti i `.mp3` dentro `MUSIC_DIR` (default `private/audio/`).
2. Per ogni file, estrae con `music-metadata`:
   - `title`, `artist`, `year`, `genre`
   - `duration` (in secondi)
   - Prima immagine embedded → salvata come `cover-<sha256>.jpg` in `COVERS_DIR`
3. UPSERT su `tracks` per `filePath` (idempotente).
4. DELETE per ogni track in DB il cui `filePath` non esiste più su disco.
5. DELETE delle cover orfane (non più referenziate).

**Robustezza**:
- Skip di file con tag corrotti (log warning, non exit).
- Skip di symlink (anti loop, anti accesso a path arbitrari).
- Solo JPEG come cover (i PNG sono scartati perché il frontend accetta solo `image/jpeg`).
- Cap 5 MB per cover (anti DoS).
- `ensureInside()` prima di scrivere cover.

**Exit code**:
- `0` — tutti i file processati (o DB invariato se cartella vuota)
- `1` — errore Prisma o I/O non recuperabile

**Output**: log su stdout (cron redirige su `logs/scan.log`). Formato `[scan] HH:MM:SS ...`. Non emette JSON, è human-readable.

## seed.js — Seed iniziale

```bash
SEED_ADMIN_EMAIL="admin@chaosroom.online" \
SEED_ADMIN_PASSWORD="qualcosa-di-sicuro-12-char" \
SEED_ADMIN_NAME="Chaos Admin" \
npm run seed
```

**Cosa crea** (idempotente — niente viene duplicato):
1. **Admin user** se `SEED_ADMIN_PASSWORD` è settato (altrimenti skip).
   - bcrypt cost 12
   - Nessuna rotazione automatica di password esistente
2. **Playlist `show-list`** con descrizione "Tutti i brani della stagione"
3. **Playlist `pirate-day-23`** con curator DJ Skeleton, descrizione con `**bold**` markdown, `endsAt` = NOW + 24h (così è subito visibile nel frontend)
4. **5 notifiche demo** broadcast (visibili a tutti gli utenti)

**Sicurezza**:
- `SEED_ADMIN_PASSWORD` deve essere almeno 8 caratteri (validato lato script).
- Non committare `SEED_ADMIN_PASSWORD` in `.env` in produzione: meglio passarla come env var al primo seed, poi rimuoverla dal pannello cPanel.

## smoke-test.mjs — Verifica E2E

```bash
# Default: http://localhost:3001
npm run test:smoke

# Custom target (es. produzione)
SMOKE_BASE_URL=https://radio.chaosroom.online npm run test:smoke
```

25 test che coprono gli item 1, 2, 4, 6, 8 della Fase 8 del piano di implementazione:

| # | Check | Categoria |
|---|---|---|
| 1 | `GET /api/health` → 200 | Salute |
| 2 | Login con credenziali errate → 401 | Sicurezza |
| 3 | Register nuovo utente → 201 + cookie | Auth |
| 4 | Me con cookie → 200 | Auth |
| 5-7 | Validazione input (no email, password corta, email malformata) → 400 | Validazione |
| 8 | Tracks auth → 200 + array | Contratto |
| 9 | Tracks senza cookie → 401 | Sicurezza |
| 10 | Tracks/9999999 → 404 | Gestione errori |
| 11 | Tracks stream inesistente → 404 | Gestione errori |
| 12 | Favorites utente nuovo → [] | Contratto |
| 13-17 | Add, list, idempotenza, delete favorite | CRUD |
| 18 | Show-list playlist → 200 + struttura | Contratto |
| 19 | Pirate-day → 200|404 | Contratto |
| 20 | Notifications → 200 + array | Contratto |
| 21-22 | Mark read + verifica stato | CRUD |
| 23 | Login input malformato → 4xx | Sicurezza |
| 24 | Logout → 204 + clear-cookie | Auth |
| 25 | Re-login con stesse credenziali → 200 | Auth |

**Output**: human-readable con `✓`/`✗` + summary finale. Exit code 0 (tutti passati) / 1 (qualche fallimento).

**Limitazioni note**:
- Verifica funzionalità del player (play/pause/seek), Range request su file audio, Media Session API → richiedono browser reale, NON sono coperte.
- Verifica UI mobile 375px → richiede DevTools, NON coperta.
- Verifica offline service worker → richiede browser, NON coperta.
- Test "FTP upload → 5min → /api/tracks" coperto indirettamente: lo script `scan.js` esegue la sincronizzazione, e dopo `scan.js` la lista `/api/tracks` riflette lo stato del disco. Si può testare manualmente:

  ```bash
  # 1. Copia un .mp3 in backend/private/audio/
  cp /path/to/track.mp3 backend/private/audio/

  # 2. Esegui lo scan
  npm run scan

  # 3. Verifica che /api/tracks ora include il nuovo file
  curl -b "token=$JWT" http://localhost:3001/api/tracks | jq '.[] | {id, title, artist}'
  ```
