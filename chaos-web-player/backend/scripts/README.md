# Chaos Radio — Scripts CLI

Script eseguibili da terminale, idempotenti e pensati per essere schedulati via cron / cPanel.

Tutti leggono le credenziali DB da `backend/.env` (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`).

| Script | Uso | Frequenza |
|---|---|---|
| `scan.js` | Sincronizza `tracks` dal contenuto di `private/audio/` + mantiene la playlist `show-list` | Ogni 5 min (cron) |
| `pirate-day.js` | Pubblica l'edizione Pirate Day dal manifest e ripulisce le edizioni scadute | Ogni ora (cron) |
| `pirate-day-init.js` | Genera/aggiorna il `manifest.json` della prossima edizione | Manuale (una volta a settimana) |
| `seed.js` | Popola DB con admin + playlist show-list + notifiche demo | Una tantum + dopo reset |
| `smoke-test.mjs` | Verifica E2E di tutti gli endpoint | Pre-deploy, debug |
| `apply-migrations.mjs` | Applica le migration SQL al DB (senza il motore Prisma, per Stellar) | Dopo ogni deploy con migration |

## Helpers condivisi (`_shared.mjs`)

Non è uno script eseguibile — esporta:

- `loadEnv(filename?)` — carica `.env` in `process.env` (no override di env esistenti)
- `requireEnv(name)` / `optionalEnv(name, fallback?)` — lettura tipata
- `resolveDir(name, fallback?)` — crea `mkdir -p` una directory env-driven
- `timestamp()` — ISO 8601 string
- `ensureInside(root, candidate)` — verifica anti path-traversal

Gli script `scan.js` e `seed.js` importano Prisma 7 con il driver adapter MariaDB (analogo a `src/db.js`) perché sono processi one-shot e non vogliamo che l'app Express rimanga in vita solo per loro.

## Librerie interne (`lib/`)

Non sono script eseguibili — esportano funzioni riusate da più script:

| Modulo | Cosa esporta | Chi lo usa |
|---|---|---|
| `lib/audioScan.mjs` | `makeLogger`, `walkMp3`, `scanOne`, `upsertTrack`, `writeCover`, `coverPathFor`, `scanDirectory` | `scan.js`, `pirate-day.js` |
| `lib/curator.mjs` | `normalizeCuratorLinks`, `CURATOR_PLATFORMS` | `pirate-day.js`, `seed.js` |
| `lib/prisma.mjs` | `makePrisma` (client Prisma 7 + adapter MariaDB) | `scan.js`, `seed.js`, `pirate-day.js`, `pirate-day-init.js` |
| `lib/waveform.mjs` | `computeWaveform`, `serializeWaveform`, `deserializeWaveform` | `scan.js`, `generate-waveforms.js` |

`lib/audioScan.mjs` è il cuore di `scan.js` estratto in una libreria: i due script
condividono lo stesso codice di scansione, quindi cover e waveform sono
identiche e non c'è duplicazione.

> `lib/prisma.mjs` importa il client Prisma, che è un file `.ts` → gli script
> che lo usano devono girare con `--experimental-strip-types` (o su Node
> ≥ 22.18, dove lo strip dei types è attivo di default). `smoke-test.mjs` non
> lo importa e gira con `node` puro.

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
6. Calcola la waveform (picchi) dei brani che non ce l'hanno ancora.
7. **Mantiene la playlist `show-list`**: la riga `playlists` (slug `show-list`,
   kind `SHOW`) viene creata se manca e i `playlist_items` vengono ricostruiti
   a ogni giro con i brani trovati in `MUSIC_DIR` **esclusi quelli sotto
   `PIRATE_DAY_DIR`**, ordinati per `addedAt desc` (la UX della show list non
   cambia). I brani del Pirate Day restano nella tabella `tracks` (servono per
   stream/cover/waveform) ma non compaiono nella show list.
8. **Crea la notifica broadcast "Nuovi brani in Show List"** quando entrano
   brani nuovi: confronta i file trovati con quelli già in `tracks` (snapshot
   fatto **prima** della scansione) e, per i file davvero creati (verificati
   sul DB, così i tag corrotti non contano) e **fuori** `PIRATE_DAY_DIR`,
   crea **una notifica per batch** con l'elenco dei brani. Un giro senza
   novità non genera nulla.

> La notifica usa `src/lib/notifications.js` (helper condiviso con l'API):
> `notifyNewTracks()`. I brani del Pirate Day sono esclusi perché hanno già
> la notifica dedicata creata da `pirate-day.js`.

> L'esclusione usa `path.relative` (`isPathInside` in `src/lib/paths.js`), non
> un `startsWith` grezzo: `/private/audio/pirate-day-2` non è dentro
> `/private/audio/pirate-day`.

**Robustezza**:
- Skip di file con tag corrotti (log warning, non exit).
- Skip di symlink (anti loop, anti accesso a path arbitrari).
- Solo JPEG come cover (i PNG sono scartati perché il frontend accetta solo `image/jpeg`).
- Cap 5 MB per cover (anti DoS).
- `ensureInside()` prima di scrivere cover.

**Exit code**:
- `0` — tutti i file processati (o DB invariato se cartella vuota)
- `1` — errore Prisma o I/O non recuperabile, oppure manutenzione della show list fallita

**Output**: log su stdout (cron redirige su `logs/scan.log`). Formato `[scan] HH:MM:SS ...`. Non emette JSON, è human-readable.

## pirate-day.js — Pirate Day (publish + cleanup)

```bash
npm run pirate-day
# equivalente a: node --env-file=.env --experimental-strip-types scripts/pirate-day.js
```

Il Pirate Day è un **evento a tempo**: i MP3 stanno in
`private/audio/pirate-day/` (cartella DENTRO `MUSIC_DIR`), il manifest
`private/audio/pirate-day/manifest.json` dice quale edizione è e quando
parte, lo script pubblica l'edizione e la ripulisce alla scadenza.

> ⚠️ La cartella DEVE stare dentro `MUSIC_DIR`: fuori, `scan.js` la
> tratterebbe come track orfani (cancellerebbe i brani ogni 5 minuti) e le
> waveform non verrebbero mai calcolate.

**Manifest** (formato dati, non codice):

```json
{
  "edition": 24,
  "title": "PIRATE DAY #24",
  "publishAt": "2026-11-20T22:00:00Z",
  "durationHours": 24,
  "description": "**A new transmission begins.** Twenty-four hours of pirate frequencies…",
  "curator": {
    "name": "DJ Skeleton",
    "role": "Resident Curator",
    "avatar": "/api/avatars/curator-24.jpg",
    "links": { "spotify": "https://…", "soundcloud": "https://…" }
  },
  "tracks": ["01 - brano.mp3", "02 - brano.mp3"]
}
```

| Campo | Serve | Destinazione |
|---|---|---|
| `edition` | numero dell'edizione | slug `pirate-day-<edition>` + `playlists.title` |
| `publishAt` | quando l'edizione è dovuta | `playlists.starts_at` |
| `durationHours` | durata della finestra "in onda" | `playlists.ends_at` |
| `description` | testo con `**bold**` | `playlists.description` |
| `curator` | profilo del curatore | `curator_name/role/avatar/links` |
| `tracks[]` | ordine dei brani | `playlist_items.position` |

`links` è un **oggetto** `{spotify: url}` (il formato che il frontend si
aspetta). Il formato ad array del vecchio seed faceva crashare `CuratorCard`.

L'avatar del curatore è un **file** in `private/avatars/curator-<ed>.<ext>`,
servito dalla rotta **pubblica** `GET /api/avatars/:file`. Nel manifest si
mette la URL **relativa** (`/api/avatars/curator-24.jpg`): non un path locale
(non lo saprebbe risolvere il browser) e non una data-URI (il campo è
`VARCHAR(191)` e finisce in un `<img src>`).

Se il campo **`tracks` è omesso** dal manifest, la lista dei brani viene
**derivata dalla cartella** (ordine alfabetico = ordine curato con il
prefisso numerico `01 -`, `02 -`…). Un array esplicito, anche vuoto, viene
invece rispettato.

**Fase A — publish** (idempotente):

1. legge e valida il manifest (JSON rotto → exit 1; manifest assente → skip);
2. `now < publishAt` → **non pubblica** (l'edizione non è ancora dovuta); la
   fase cleanup prosegue comunque;
3. upsert dei track (idempotente su `filePath`), riusando la logica di scan;
4. upsert della playlist `pirate-day-<edition>`:
   - **(a)** non esiste → create con `startsAt = max(publishAt, now)`,
     `endsAt = startsAt + durationHours`;
   - **(b)** esiste ed è **live** (`endsAt > now`) → aggiorna contenuti
     (items, curatore, descrizione) **senza spostare la finestra**;
   - **(c)** esiste ma è scaduta → **riapre** la finestra da `now`;
5. ricostruisce i `playlist_items` con `position` = indice del manifest;
6. crea la notifica broadcast "Pirate Day #N is on the air" (`kind = PIRATE_DAY`,
   idempotente per edizione tramite `dedupeKey = "pirate-day:<N>"`);
7. log `[pirate-day] ✓ #N pubblicato (endsAt=…)`.

**Fase B — cleanup** (idempotente, retry-safe):

Per ogni edizione con `endsAt <= now`:

1. sorgente di verità = i suoi `playlist_items` → `tracks.filePath` → si
   cancellano **solo i file di quell'edizione** (mai tutta la cartella: il
   curatore può aver caricato in anticipo i file dell'edizione successiva);
2. `ensureInside(PIRATE_DAY_DIR, filePath)` poi `fs.unlink` (`ENOENT` ignorato);
3. unlink del file waveform `private/waveforms/waveform-<id>.txt` (l'unico
   derivato che nessuno pulisce: le cover le pulisce già `scan.js`);
4. unlink dell'**avatar del curatore** `private/avatars/curator-<ed>.<ext>`
   (il nome arriva da `playlists.curator_avatar`: si prende l'ultimo
   segmento della URL e si verifica che rispetti il pattern
   `curator-<n>.<ext>`, quindi non si cancella mai un file fuori da quella
   directory; se la cancellazione fallisce è solo un warning, non blocca
   l'edizione);
5. **solo se tutti gli unlink dei brani sono andati a buon fine** → delete
   delle righe `tracks` (cascade su `playlist_items` e `favorites`) e delete
   della riga `playlists` dell'edizione;
6. se un unlink di un brano fallisce: log + skip dell'edizione + exit code 1
   → il giro successivo ritenta.

L'ordine **file prima, DB dopo** è deliberato: cancellando prima il DB, un
file rimasto su disco verrebbe re-inserito dallo scanner come track orfano
senza più nessuna edizione che lo referenzia → non verrebbe più rimosso.

L'edizione indicata dal manifest è **riservata**: non viene ripulita dal
cleanup (i suoi file sono quelli dell'edizione in arrivo).

**Env vars**:

| Var | Default | Note |
|---|---|---|
| `PIRATE_DAY_DIR` | `private/audio/pirate-day` | deve stare dentro `MUSIC_DIR` |
| `PIRATE_DAY_MANIFEST` | `manifest.json` | relativo a `PIRATE_DAY_DIR` |
| `PIRATE_DAY_WINDOW_HOURS` | `24` | durata della finestra (se il manifest non dice `durationHours`) |
| `PIRATE_DAY_KEEP_FILES` | — | se `1` la fase B non cancella i file (solo DB): debug |
| `AVATARS_DIR` | `private/avatars` | cartella degli avatar del curatore: deve coincidere con quella dell'app (`AVATARS_DIR` nel pannello), altrimenti il cleanup cancella un file diverso da quello servito |

**Exit code**: `0` — tutto ok; `1` — manifest irrecuperabile o unlink fallito.

**Output**: log su stdout (cron redirige su `logs/pirate-day.log`), formato
`[pirate-day] ...`.

**Cron** (cPanel): il giorno/ora NON sta nel cron, sta nel manifest.

```
0 * * * * cd /home/USER/radio.chaosroom.online/chaos-web-player/backend && /usr/bin/node --env-file=.env --experimental-strip-types scripts/pirate-day.js >> logs/pirate-day.log 2>&1
```

Da evitare `0 0 */7 * *`: il giorno del mese si azzera a ogni mese → intervalli
irregolari (31→1 = 1 giorno, 1→8 = 7 giorni).

## pirate-day-init.js — Generatore del manifest

```bash
npm run pirate-day:init
# equivalente a: node --env-file=.env --experimental-strip-types scripts/pirate-day-init.js
```

Genera (o rigenera) `private/audio/pirate-day/manifest.json` a partire da:

1. **i MP3 presenti nella cartella** → `tracks[]`, in ordine alfabetico
   (= ordine curato con il prefisso numerico);
2. **il curatore**: dal manifest corrente (l'edizione precedente, che
   trascini) → dall'edizione pubblicata nel DB → dalle env var → dai
   default. Il curatore **cambia a ogni edizione**, quindi sta nel manifest
   e lo editi a mano: il generatore non lo sovrascrive.
3. **la descrizione**: è la **stessa per tutte le edizioni**, quindi la
   fornisce l'env var `PIRATE_DAY_DESCRIPTION`; se manca, si usa il
   manifest, poi il DB, poi il default.
4. **la prossima edizione** → max(edizioni pubblicate nel DB, edizione del
   manifest) + 1;
5. **la prossima data** → il prossimo "venerdì 22:00" Europe/Rome (giorno e
   ora fissi, configurabili con le env var: non si ereditano dall'edizione
   precedente, altrimenti un publish in ritardo farebbe slittare di un'ora
   tutte le edizioni successive).

**Cosa fa in più**

- **Archivia** il manifest precedente in `_archive/manifest-<edition>.json`
  prima di sovrascriverlo.
- **Non sovrascrive** un manifest che descrive un'edizione **non ancora
  pubblicata** (cambierebbe la programmazione) né un manifest con un'edizione
  più alta di quella calcolata: in entrambi i casi esce con exit code 0 e un
  avviso. `--force` per procedere comunque.
- Se l'edizione descritta dal manifest non è ancora stata pubblicata, il
  **numero non cambia**: rigenerare il manifest non salta edizioni.
- Se il curatore **non** viene da una env var, il log lo segnala
  ("curatore: … (da manifest)" + "ricordati di cambiare il curatore per
  questa edizione"): così non si ripete il curatore dell'edizione
  precedente per disattenzione.

**Argomenti**

| Argomento | Effetto |
|---|---|
| `--force` | sovrascrive il manifest anche se l'edizione non è ancora stata pubblicata (o se è più avanti di quella calcolata) |
| `--edition=N` | forza il numero di edizione (con `--force` per andare anche a un numero più basso) |
| `--publish-at=ISO` | forza la data/ora di pubblicazione |

**Env vars**

| Var | Default | Note |
|---|---|---|
| `PIRATE_DAY_INIT_PUBLISH_AT` | — | data di pubblicazione (override del calcolo) |
| `PIRATE_DAY_INIT_WEEKDAY` | `Fri` | giorno della settimana della pubblicazione |
| `PIRATE_DAY_INIT_HOUR` | `22` | ora locale della pubblicazione |
| `PIRATE_DAY_INIT_TZ` | `Europe/Rome` | fuso per il calcolo della data |
| `PIRATE_DAY_DESCRIPTION` | — | descrizione delle edizioni (stessa per tutte): i `\n` diventano a capo |
| `PIRATE_DAY_CURATOR_NAME` | — | curatore di riserva (solo se il manifest non ne ha uno) |
| `PIRATE_DAY_CURATOR_ROLE` | — | idem |
| `PIRATE_DAY_CURATOR_AVATAR` | — | idem |
| `PIRATE_DAY_CURATOR_LINKS` | — | idem, JSON su una riga: `{"spotify":"https://…"}` |

**Uso su Stellar (cPanel "Run JS Script")**

> ⚠️ **Su Stellar NON usare "Run NPM Script"**: quel runner avvia node con
> limiti LVE più stretti e Node non riesce ad allocare la WebAssembly del
> type-stripping → `RangeError: WebAssembly.Instance(): Out of memory`.
> Lo stesso script lanciato da SSH o da cron **funziona** (verificato in
> produzione). Per il "Run JS Script" di cPanel: funziona solo con l'app
> Express fermata, e conviene comunque preferire SSH.

**Accesso SSH (Stellar)**

```
ssh -i ~/.ssh/id_ed25519 -p 21098 chaouaza@198.177.120.31
```

La porta **21098** è quella assegnata all'account (cPanel → SSH Access →
Access Details). Con la shell attiva si possono lanciare gli script a mano:

```bash
cd /home/chaouaza/radio.chaosroom.online/chaos-web-player/backend
/home/chaouaza/nodevenv/radio.chaosroom.online/chaos-web-player/backend/22/bin/node \
  --env-file=.env --experimental-strip-types scripts/pirate-day-init.js
```

Il percorso di `node` è quello del **virtualenv** (cPanel → Setup Node.js
App → *Virtual environment*): il cron non ha la PATH dell'utente, quindi il
path deve essere assoluto.

**Flusso settimanale consigliato**:

1. carichi i nuovi MP3 in `private/audio/pirate-day/`;
2. **Run JS Script** → `scripts/pirate-day-init.js` → il manifest viene
   (ri)generato con i brani, la data e la descrizione;
3. editi **solo il curatore** nel manifest (nome, ruolo, link): cambia a ogni
   edizione, quindi sta lì;
4. il cron orario di `pirate-day.js` pubblica l'edizione quando arriva.

La descrizione invece non la tocchi mai: sta nell'env var
`PIRATE_DAY_DESCRIPTION` e il generatore la reinietta in ogni manifest.

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
   (i brani li inserisce `scan.js`)
3. **Normalizzazione dei `curator_links`** delle playlist PIRATE_DAY già
   presenti: il vecchio seed scriveva `[{type, url}]`, formato che faceva
   crashare `CuratorCard` nel frontend (ora si aspetta `{spotify: url}`).
4. **5 notifiche demo** broadcast (visibili a tutti gli utenti)

> ⚠️ Il seed **non** crea più l'edizione `pirate-day-23`: da Fase 10 il
> Pirate Day si pubblica con `npm run pirate-day` a partire dal manifest.
> Non usare più `npm run seed` per il Pirate Day.

**Sicurezza**:
- `SEED_ADMIN_PASSWORD` deve essere almeno 8 caratteri (validato lato script).
- Non committare `SEED_ADMIN_PASSWORD` in `.env` in produzione: meglio passarla come env var al primo seed, poi rimuoverla dal pannello cPanel.

## apply-migrations.mjs — Applica le migration SQL

```bash
node --env-file=.env --experimental-strip-types scripts/apply-migrations.mjs

# dry-run: elenca cosa verrebbe applicato senza toccare il DB
node --env-file=.env --experimental-strip-types scripts/apply-migrations.mjs --dry-run
```

Su Stellar (Namecheap shared) `prisma migrate deploy` **non funziona**: il
binario WASM del query engine di Prisma 7 non si scarica su quell'hosting
(vedi `deploy/DEPLOY.md` → STEP 7b). Questo script applica le stesse
migration SQL con il driver `mariadb`, che è già una dipendenza di
produzione (è quello che usa il client Prisma via driver adapter).

- Legge `prisma/migrations/*/migration.sql` in ordine cronologico.
- Tiene traccia delle migration applicate in `schema_migrations`; se il DB ha
  già la tabella `_prisma_migrations` di Prisma, anche quella viene letta (le
  migration che Prisma considera applicate non vengono riapplicate).
- È **idempotente**: le istruzioni "già presenti" (colonna, indice, FK
  duplicati) vengono saltate con un avviso → si può rieseguire senza effetti
  collaterali.
- In locale, con un DB raggiungibile, si può continuare a usare
  `npx prisma migrate dev` (fa anche il diff dello schema).

Output tipico:

```
[migrate] 2 migration nel repo, 0 già applicate, 2 da applicare
[migrate] applico 20261006105522_init…
[migrate]   ↷ già presente, salto: CREATE TABLE `users` …
[migrate] ✓ 20261006105522_init applicata
[migrate] applico 20261119173000_notification_history_kind…
[migrate] ✓ 20261119173000_notification_history_kind applicata
[migrate] ✓ done
```

In produzione (SSH):

```bash
cd /home/chaouaza/radio.chaosroom.online/chaos-web-player/backend
/home/chaouaza/nodevenv/radio.chaosroom.online/chaos-web-player/backend/22/bin/node \
  --env-file=.env scripts/apply-migrations.mjs
```

> La pipeline di deploy (`.cpanel.yml`) prova comunque `npx prisma migrate
> deploy`: su Stellar fallisce e prosegue (`|| echo ...`). Le migration vanno
> quindi applicate a mano con questo script (o via phpMyAdmin).

## smoke-test.mjs — Verifica E2E

```bash
# Default: http://localhost:3001
npm run test:smoke

# Custom target (es. produzione)
SMOKE_BASE_URL=https://radio.chaosroom.online npm run test:smoke
```

I check coprono il contratto di tutti gli endpoint, gli invarianti I1/I3 del Pirate Day (i brani dell'edizione non sono preferitabili) e le notifiche (storico, `read-all`, creazione custom riservata agli admin):

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
| 20 | Notifications → 200 + `{items, total, unreadCount}` | Contratto |
| 21-22 | Read-all → 204, tutte lette, **lo storico non sparisce** | CRUD |
| 23 | Mark read singola notifica → 204 | CRUD |
| 24 | Notifica custom senza sessione → 401 | Sicurezza |
| 25 | Notifica custom come non admin → 403 | Sicurezza |
| 26 | DELETE notifica come non admin → 403 | Sicurezza |
| 27 | Notifica custom come admin → 201 + visibile + DELETE (se `SMOKE_ADMIN_EMAIL`/`SMOKE_ADMIN_PASSWORD` sono impostate) | CRUD |
| 28 | Login input malformato → 4xx | Sicurezza |
| 29 | Logout → 204 + clear-cookie, re-login con stesse credenziali → 200 | Auth |
| 30 | Pirate-day → shape `{title, curator, items[], endsAt}` | Contratto |
| 31 | Show list ∩ track(playlist `PIRATE_DAY`) = ∅ | Contratto |
| 32 | Item pirate day → `favoriteable = false` | Contratto |
| 33 | Item show list → `favoriteable ≠ false` | Contratto |
| 34 | `POST /api/favorites/<track pirate day>` → 403 | Sicurezza |
| 35 | `GET /api/favorites` senza track pirate day | Contratto |
| 36 | `GET /api/avatars/<inesistente>` → 404 `avatar_not_found` | Contratto |
| 37 | `GET /api/avatars/<path traversal>` → 404 `avatar_not_found` | Sicurezza |
| 38 | `GET /api/avatars/<avatar dell'edizione>` → 200 immagine (se l'edizione attiva ne ha uno) | Contratto |

I check 30-35 sono **saltati** (non falliti) quando non c'è un'edizione
Pirate Day attiva: il `○` nel log indica uno skip, e il riepilogo li conta
separatamente (`N skipped`). Uno skip non fa uscire con codice 1.

Il check 38 è saltato quando l'edizione attiva non ha un avatar impostato
(`curator.avatar` vuoto): è la situazione normale fino alla prima edizione
con l'avatar caricato.

> **Rate limit**: in produzione `/auth/*` accetta 5 richieste ogni 15 minuti
> per IP e lo smoke test ne fa 7 → i check che lo toccano diventano skip e
> il test si ferma con un messaggio esplicito. Per eseguirlo per intero in
> produzione serve `AUTH_RATE_LIMIT_MAX=20` nel pannello env vars.

**Output**: human-readable con `✓`/`✗`/`○` (skip) + summary finale. Exit code 0 (tutti passati, skip compresi) / 1 (qualche fallimento).

**Limitazioni note**:
- Verifica funzionalità del player (play/pause/seek), Media Session API → richiedono browser reale, NON sono coperte.
- La **Range request** sullo stream **è** coperta (check dedicato: `Range: bytes=0-99` → 206 + `Content-Range` + 100 byte).
- Verifica UI mobile 375px → richiede DevTools, NON coperta.
- Verifica offline service worker → richiede browser, NON coperta.
- La **cascade** "brano cancellato → sparisce dai preferiti" non è verificabile
  via API (serve cancellare una riga `tracks`): si verifica a mano con la
  fase cleanup del `pirate-day.js` (o cancellando l'edizione e osservando i
  preferiti al refetch successivo).
- Test "FTP upload → 5min → /api/tracks" coperto indirettamente: lo script `scan.js` esegue la sincronizzazione, e dopo `scan.js` la lista `/api/tracks` riflette lo stato del disco. Si può testare manualmente:

  ```bash
  # 1. Copia un .mp3 in backend/private/audio/
  cp /path/to/track.mp3 backend/private/audio/

  # 2. Esegui lo scan
  npm run scan

  # 3. Verifica che /api/tracks ora include il nuovo file
  curl -b "token=$JWT" http://localhost:3001/api/tracks | jq '.[] | {id, title, artist}'
  ```
