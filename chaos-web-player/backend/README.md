# Chaos Radio backend — README sviluppatore

Backend Express + Prisma per il web player Chaos Radio, **live su [radio.chaosroom.online](https://radio.chaosroom.online)**.

## Stack

- **Node.js 22** (cPanel Stellar prod, dev WSL) — richiede **≥ 22.6** per `--experimental-strip-types` sui `.ts` del client Prisma; da **22.18** il type-stripping è nativo (nessun flag)
- **Express 5**
- **Prisma 7.10** con `@prisma/adapter-mariadb` + driver `mariadb` (MariaDB è compatibile con MySQL 8)
- **MySQL 8** (via WSL in dev, via cPanel in prod)
- **JWT** in cookie httpOnly, **bcrypt** per le password
- **TypeScript runtime**: type-stripping nativo di Node (nessuna dipendenza `tsx`)

## Quickstart (dev locale)

### Prerequisiti

- **WSL 2** con Ubuntu 24.04 (o distro simile con systemd attivo)
- **MySQL 8** installato in WSL con `bind-address = 0.0.0.0` e utente `chaos_app` con `mysql_native_password` + `ALL PRIVILEGES ON *.* WITH GRANT OPTION`
- **Node.js 22** in WSL (da NodeSource `setup_22.x`)

### Setup

```bash
# 1. Dipendenze
npm install
# dotenv è in dependencies: NON viene importato da src/ (le env vars
# dell'app arrivano dal pannello cPanel / dal process.env). Resta per
# prisma7.config.ts e per gli script CLI (--env-file).

# 2. Configurazione env
cp .env.example .env
# Modifica .env: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET

# 3. Migration
DB_HOST=127.0.0.1 npx prisma migrate dev --name init
# (genera il client TypeScript in generated/prisma/ e applica migration al DB)

# 4. Avvio server (dev)
npm run dev
```

Server in ascolto su `http://localhost:3001`. Health check: `GET /api/health`.

### Setup MySQL da zero (riferimento rapido, in WSL)

```bash
wsl -u root apt install -y mysql-server
wsl -u root sed -i 's/^bind-address.*=.*127.0.0.1/bind-address = 0.0.0.0/' /etc/mysql/mysql.conf.d/mysqld.cnf
wsl -u root service mysql restart

wsl -u root mysql -e "
  CREATE DATABASE IF NOT EXISTS chaos_radio;
  CREATE USER IF NOT EXISTS 'chaos_app'@'%' IDENTIFIED WITH mysql_native_password BY 'devpass';
  GRANT ALL PRIVILEGES ON *.* TO 'chaos_app'@'%' WITH GRANT OPTION;
  FLUSH PRIVILEGES;
"
```

## Setup portproxy Windows (riferimento rapido)

Da PowerShell come amministratore:
```powershell
$wslIp = wsl hostname -I
netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=3001 connectaddress=$wslIp connectport=3001
New-NetFirewallRule -DisplayName "WSL MySQL" -Direction Inbound -LocalPort 3306 -Protocol TCP -Action Allow
```

Dopo un riavvio di WSL, rieseguire il blocco con il nuovo `$wslIp`.

## Script

| Script | Cosa fa |
|---|---|
| `npm run dev` | `node --experimental-strip-types --watch src/index.js` (dev) |
| `npm start` | `node --experimental-strip-types src/index.js` (produzione) |
| `npm run scan` | scansiona `private/audio/*.mp3`, estrae tag ID3 + cover, sincronizza `tracks` e calcola le waveform mancanti (vedi `scripts/scan.js`) |
| `npm run waveforms` | calcola la waveform (picchi) dei brani che non ce l'hanno ancora — vedi `scripts/generate-waveforms.js`. `-- --force` ricalcola tutti |
| `npm run pirate-day` | pubblica l'edizione Pirate Day dal `manifest.json` (o la ripulisce se scaduta) — vedi `scripts/pirate-day.js` |
| `npm run pirate-day:init` | genera/aggiorna il `manifest.json` dell'edizione successiva (curatore, descrizione, data) — vedi `scripts/pirate-day-init.js` |
| `npm run seed` | popola DB con dati demo (admin, playlist show-list, playlist pirate-day-23, 5 notifiche) — vedi `scripts/seed.js` |
| `npm run test:smoke` | E2E smoke test (auth, tracks, favorites, playlists, notifications, regole Pirate Day). |
| `npm run prisma:studio` | GUI Prisma per ispezionare il DB |
| `npm run prisma:generate` | rigenera il client TypeScript in `generated/prisma/` |
| `npm run prisma:migrate` | `prisma migrate dev` (crea/aggiorna migration) |
| `npm run prisma:deploy` | `prisma migrate deploy` (per produzione) |

Dettagli su ogni script: vedi `scripts/README.md`.

## Endpoint API

Base: `/api`. Tutti richiedono autenticazione (cookie `token` httpOnly) tranne:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/health` (pubblico: stato del processo)
- `GET /api/debug` (pubblico: processo, env check, `git.sha`, strumenti di sistema)

> `GET /api/debug` espone anche `DB_HOST`, `DB_USER`, `DB_NAME` e la
> **lunghezza** del JWT secret (non il valore). È una diagnostica utile
> (serve a capire quale codice sta girando), ma è information disclosure:
> da proteggere se il dominio diventa pubblico per davvero.

### Contratto `Track`

Ogni brano esposto dalle API (`/api/tracks`, `/api/playlists/*`,
`/api/favorites`) è il record Prisma **più** il flag:

```jsonc
{
  "id": 12,
  "title": "Fetish For Sampling",
  "artist": "Marco Hack",
  "filePath": "/…/private/audio/pirate-day/01 - ….mp3",
  "coverPath": "/…/private/covers/cover-….jpg",
  "addedAt": "2026-11-13T22:35:53.407Z",
  "favoriteable": false        // ← false = il brano NON è preferitabile
}
```

`favoriteable` è calcolato dal server con **un solo predicato**
(`isFavoriteable` in `src/lib/pirateDay.js`): un brano non è preferitabile
se appartiene a una playlist `PIRATE_DAY` **oppure** se il suo file sta
dentro `PIRATE_DAY_DIR`. Lo stesso predicato fa da guard in
`POST /api/favorites/:id` → **403 forbidden**: la UI non può quindi mostrare
un cuore che il server rifiuterebbe (i brani del Pirate Day non sono
preferitabili, invariante I3).

### Tracks

```
GET /api/tracks                    (auth) → 200 [Track] ordinati per addedAt desc
GET /api/tracks/:id                (auth) → 200 Track | 404
GET /api/tracks/:id/stream         (auth) → 200 audio/mpeg, Range supportato → 206
GET /api/tracks/:id/cover          (auth) → 200 image/jpeg | 404
GET /api/tracks/:id/waveform       (auth) → 200 { waveform: "<base64>" } | 404
```

`GET /api/tracks/:id/stream` risponde **206 Partial Content** a una richiesta `Range` (non 200 con il file intero): vedi la sezione hardening più in basso.

`GET /api/tracks/:id/waveform` restituisce i 300 picchi del brano serializzati in base64 (400 caratteri). Restituisce 404 se la waveform non è ancora stata calcolata: in quel caso il frontend mostra la waveform decorativa di fallback.

### Favorites

```
GET    /api/favorites              (auth) → 200 [Track] (i non preferitabili sono esclusi)
POST   /api/favorites/:trackId     (auth) → 204 | 403 (brano non preferitabile) | 404
DELETE /api/favorites/:trackId     (auth) → 204
```

### Playlists

```
GET /api/playlists/show-list       (auth) → 200 { title, items: [Track] }
GET /api/playlists/pirate-day      (auth) → 200 { title, curator, description, startsAt, endsAt, items: [Track] } | 404 (nessuna edizione attiva)
```

La show list **non** contiene mai i brani del Pirate Day (filtro per path
**e** per dati).

### Auth flow

```
POST /api/auth/register  { email, password, displayName? }  → 201 { user } + Set-Cookie
POST /api/auth/login     { email, password }               → 200 { user } + Set-Cookie
POST /api/auth/logout    (auth)                           → 204 + Clear-Cookie
GET  /api/auth/me         (auth)                           → 200 { user }
```

`/auth/login` e `/auth/register` sono protetti da un rate limit: **5
richieste ogni 15 minuti per IP** in produzione, configurabile con
`AUTH_RATE_LIMIT_MAX` (lo smoke test ne fa 7 → in produzione va alzato o
si aspetta la fine della finestra).

## Vincoli Prisma 7 / driver adapter

Prisma 7 ha introdotto breaking changes rispetto a Prisma 5:

1. **Richiede un driver adapter esplicito**. Non esiste un adapter MySQL ufficiale, ma `@prisma/adapter-mariadb` (con driver `mariadb`) è compatibile con MySQL 8.
2. **Genera solo TypeScript** (`generated/prisma/client.ts`, no più `.js`). Per importare il client: `import { PrismaClient } from "../generated/prisma/client.ts"` (path relativo + estensione `.ts` esplicita).
3. **Config file separato**: `prisma7.config.ts` contiene `DATABASE_URL` (letto da env via `dotenv/config`).
4. **Output custom**: il client viene generato in `generated/prisma/` (non più in `node_modules/@prisma/client`).
5. **Database URL separate env vars**: `PrismaMariaDb` non accetta connection string, richiede `host`, `port`, `user`, `password`, `database` come campi separati.

Per eseguire il backend serve **Node ≥ 22.6** (per `--experimental-strip-types` sui `.ts` di Prisma). Da **Node 22.18** il flag non serve: il type-stripping è attivo di default. `tsx` non è più usato né è una dipendenza.

## Struttura

```
backend/
├── prisma/
│   ├── schema.prisma        # 7 modelli + 1 enum
│   └── migrations/          # versionate, applicate in prod via phpMyAdmin import
├── prisma7.config.ts        # config Prisma 7 (DATABASE_URL)
├── generated/
│   └── prisma/              # client TS generato (committato, gitignored per build future)
├── src/
│   ├── index.js             # Express entry: helmet, CORS, routes, static serving, SPA fallback, /api/debug
│   ├── db.js                # Prisma singleton + driver adapter MariaDB
│   ├── lib/
│   │   ├── jwt.js           # sign/verify HS256, fail-fast se SECRET mancante
│   │   ├── paths.js         # percorsi condivisi (PIRATE_DAY_DIR, isPathInside)
│   │   ├── pirateDay.js     # predicati Pirate Day: pirateDayTrackIds, isPirateDayPath, isFavoriteable, toTrackDto
│   │   ├── deployInfo.js    # SHA del commit in esecuzione (env DEPLOY_SHA, git, o lettura di .git/HEAD)
│   │   └── waveformStore.js # path dei file di waveform (nessuna colonna nel DB)
│   ├── middleware/
│   │   ├── auth.js          # requireAuth (legge cookie, popola req.user)
│   │   ├── error.js         # HttpError + errorHandler (Prisma-aware: P2002, P2025, 4xx del body parser)
│   │   └── rateLimit.js     # authRateLimit (5/15min prod, configurabile con AUTH_RATE_LIMIT_MAX) + streamRateLimit
│   └── routes/
│       ├── auth.routes.js
│       ├── tracks.routes.js
│       ├── favorites.routes.js
│       ├── playlists.routes.js
│       └── notifications.routes.js
└── scripts/
    ├── _shared.mjs            # env loader (dotenv), prisma factory, helpers
    ├── lib/                   # moduli condivisi dagli script (prisma, audioScan, curator)
    ├── scan.js                # cron: scansiona /private/audio, ID3 → tracks, waveform
    ├── generate-waveforms.js  # ricalcola solo le waveform mancanti
    ├── pirate-day.js          # cron: pubblica l'edizione dal manifest / ripulisce quella scaduta
    ├── pirate-day-init.js     # genera il manifest dell'edizione successiva
    ├── seed.js                # admin + playlist + notifiche demo
    └── smoke-test.mjs         # E2E smoke test
```

## Note su deploy produzione (Namecheap Stellar)

In produzione, il backend gira su cPanel Application Manager (Phusion Passenger). Differenze dal dev:

- **Env vars via pannello cPanel**, non da un file: il backend **non** carica `.env` (importare `dotenv/config` su cPanel shared rompe per la cache di Passenger — vedi `deploy/DEPLOY.md`). Il file `backend/.env` esiste solo per gli **script CLI e i cron**, che lo leggono con `node --env-file=.env`.
- **`dotenv` resta in `dependencies`** per `prisma7.config.ts` e per gli script.
- **Portproxy Windows → WSL** solo per dev. In prod, il backend gira direttamente su Stellar.
- **MySQL** è in `localhost` (sulla stessa macchina Stellar).
- **MySQL auth plugin**: `mysql_native_password` (NON `caching_sha2_password` di default in MySQL 8.x, che causa `PROTOCOL_CONNECTION_LOST` con `mariadb` driver).
- **Prisma `migrate deploy`** NON può essere eseguito senza terminale: si applica la migration via phpMyAdmin import del file `prisma/migrations/<timestamp>_init/migration.sql`.
- **Il frontend è servito dall'app Express** (`express.static` su `chaos-web-player/frontend/dist`), non da Apache: il `.htaccess` del doc root è solo il blocco di configurazione Passenger generato da CloudLinux.

Per dettagli sul deploy, vedi `../deploy/DEPLOY.md`.

## Scanner audio (cron)

L'admin carica MP3 via FTP/SFTP in `backend/private/audio/`. Lo script `npm run scan` legge i tag ID3, estrae cover art embedded, e popola la tabella `tracks`.

In produzione Stellar il job è schedulato con **cPanel Cron Jobs** (è attivo):

```
*/5 * * * * cd /home/USER/radio.chaosroom.online/chaos-web-player/backend && /usr/bin/node --experimental-strip-types scripts/scan.js >> logs/scan.log 2>&1
```

> Sostituisci `USER` col tuo username cPanel. La cartella `logs/` viene creata automaticamente da `.cpanel.yml` ad ogni deploy. Gli script leggono le env vars da `backend/.env` (`node --env-file=.env`): `PIRATE_DAY_DIR` va impostata con un path **assoluto** (vedi `deploy/DEPLOY.md`), altrimenti il criterio "è un brano del Pirate Day?" dell'app e quello dello scanner possono divergere.

Env opzionali:
- `MUSIC_DIR` (default: `private/audio`) — dove cercare i `.mp3`
- `COVERS_DIR` (default: `private/covers`) — dove salvare le cover estratte
- `SCAN_BATCH_SIZE` (default: 20) — file processati in parallelo per batch
- `WAVEFORMS_DIR` (default: `private/waveforms`) — dove salvare i picchi delle waveform
- `WAVEFORM_TIMEOUT_MS` (default: 60000) — timeout per brano durante il calcolo della waveform

Lo script è idempotente: rieseguendolo non duplica righe (UPSERT su `file_path`) e cancella i track orfani (file presenti in DB ma non più su disco). Vedere `scripts/README.md` per i dettagli.

## Waveform dei brani (picchi)

Il player mostra la forma d'onda reale di ogni brano: 300 bucket con l'ampiezza del segmento corrispondente, serializzati in base64 e salvati in `private/waveforms/waveform-<trackId>.txt`.

**Dove viene calcolata**: dallo `scan` (e da `npm run waveforms`), che ricalcola **solo** i brani senza file. Dopo il primo passaggio non costa più nulla.

**Come viene calcolata**: su Stellar **non c'è ffmpeg** (verificabile con `GET /api/debug` → `tools.ffmpeg.available === false`), e i brani in libreria sono **CBR 320 kbps**, quindi l'euristica "dimensione del frame ∝ energia" produrrebbe una linea piatta. Serve un decoder vero: si usa **`mpg123-decoder`**, la build WebAssembly di mpg123 (nessuna dipendenza nativa, gira su Node 20+).

Tre scelte, ognuna verificata su un MP3 reale di produzione:

- **Decode a chunk**: i frame MPEG vengono passati a `decodeFrames()` a gruppi di 64, così il PCM non viene mai materializzato per intero. Picco di memoria **60 MB** invece di 172 MB (importante su hosting condiviso). Un brano da 171 s decodifica in ~400 ms.
- **RMS, non max**: il valore massimo per bucket su un master moderno compresso è a pieno scala ovunque, e la waveform risulterebbe piatta. L'RMS riflette l'energia media del bucket.
- **Normalizzazione adattiva**: la finestra in dB non è fissa (-60..0 dB schiaccia i brani loud in cima al 100%) ma calcolata sul brano stesso, dal 5° al 95° percentile.

**Perché un file e non una colonna nel DB**: Stellar non ha terminale e `prisma migrate deploy` su quell'hosting è inaffidabile (stesso problema del client WASM di Prisma 7). Una migrazione non applicata che aggiunge una colonna a `tracks` farebbe fallire **tutte** le query sui brani, portando giù l'app intera. Il path del file si deriva dal `trackId`, quindi non serve nessuna colonna.

## Hardening di Fase 8

Miglioramenti di sicurezza/robustezza applicati durante l'implementazione della Fase 8 del piano:

- **JWT_SECRET minimo 32 caratteri** (`src/lib/jwt.js`): il backend rifiuta di avviarsi se `JWT_SECRET` è troppo corto. Genera uno nuovo con `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`.
- **Validazione email robusta** (`src/routes/auth.routes.js`): regex + cap di lunghezza (254 char, RFC 5321) invece del semplice `includes("@")` originale.
- **Cap lunghezza password e displayName** (anti-abuse): password 8–128 char, displayName ≤ 64 char.
- **Defensive path check nello scanner** (`scripts/scan.js`): evita symlink loop, scarta file fuori da `MUSIC_DIR`, validazione magic bytes JPEG sulle cover (max 5 MB).

## Range request sullo stream audio

`GET /api/tracks/:id/stream` usa **`res.sendFile()`**, non `fs.createReadStream().pipe(res)`.

La differenza è cruciale: `sendFile` (wrapper di `send`) gestisce nativamente le Range request, e `createReadStream` **no**. La vecchia implementazione dichiarava `Accept-Ranges: bytes` ma **ignorava** l'header `Range`: ogni seek del player riscaricava l'intero MP3.

Misurato su un brano da 14,5 MB:

| Implementazione | `Range: bytes=100-199` | Byte ricevuti |
|---|---|---|
| `createReadStream().pipe(res)` | `200 OK`, nessun `Content-Range` | **14.500.000** (file intero) |
| `res.sendFile()` | `206 Partial Content`, `Content-Range: bytes 100-199/14524451` | **100** |

`sendFile` inoltre imposta `ETag`/`Last-Modified` e **chiude lo stream quando il client abortisce** la connessione: il browser lo fa a ogni seek, e senza quella gestione il server continuava a leggere il file da disco scrivendo in un socket morto.

C'è un test di regressione nello smoke test (`Range: bytes=0-99` → deve dare `206` + `Content-Range` + 100 byte).

## Diagnostica dell'ambiente host

`GET /api/debug` espone anche `tools`, con la disponibilità degli strumenti di sistema calcolata **al boot** (non per richiesta: la sonda lancia dei processi):

```json
"tools": {
  "ffmpeg":  { "available": false, "reason": "non installato" },
  "ffprobe": { "available": false, "reason": "non installato" }
}
```

Serve a capire cosa si può usare su quel server. La stessa sonda è anche in `.cpanel.yml` (`[deploy] ffmpeg: ...`), quindi l'informazione compare anche nel log del deploy.

**`git.sha`** dice quale commit sta **davvero** in esecuzione:

```json
"git": { "sha": "951be15", "source": "gitdir" }
```

`source` può essere `env` (`DEPLOY_SHA`), `git` (comando `git` disponibile) o
`gitdir` (lettura diretta di `.git/HEAD` + `.git/refs/heads/<branch>`: è il
caso di Passenger, dove `git` non è nel PATH). Con questo campo la trappola
"frontend nuovo, backend vecchio" è visibile al primo colpo d'occhio.

> **Attenzione**: `/api/debug` è **pubblico** (nessun auth) e restituisce anche `DB_HOST`, `DB_USER`, `DB_NAME`, `DB_PORT` e la **lunghezza** del JWT secret. Il valore del secret non viene esposto, quindi il rischio è basso, ma è information disclosure inutile su un dominio pubblico. Da proteggere (token / allowlist IP / rimozione in produzione).
- **Smoke test E2E** (`scripts/smoke-test.mjs`): verifiche automatizzate sugli endpoint principali (auth, tracks, favorites, playlists, notifications, Range request, waveform, regole Pirate Day). Da usare prima di ogni deploy in prod:

  ```bash
  # Contro dev locale
  npm run test:smoke

  # Contro produzione (PowerShell)
  $env:SMOKE_BASE_URL="https://radio.chaosroom.online"; npm run test:smoke

  # Contro produzione (bash)
  SMOKE_BASE_URL=https://radio.chaosroom.online npm run test:smoke
  ```

  In produzione il rate limit su `/auth/*` (5 req / 15 min per IP) viene
  esaurito dal test stesso: i check che lo toccano diventano **skip** (non
  fallimenti) e il test si ferma con un messaggio esplicito. Per eseguirlo
  per intero serve `AUTH_RATE_LIMIT_MAX=20` nel pannello env vars.
