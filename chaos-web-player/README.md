# Chaos Radio — Root

Monorepo del web player Chaos Radio, **live su [radio.chaosroom.online](https://radio.chaosroom.online)** (Namecheap Stellar).

## Struttura

```
chaos web player/               ← ROOT DEL REPO (è qui .cpanel.yml)
├── .cpanel.yml                 ← pipeline di deploy letta da cPanel Git Version Control
├── .github/workflows/deploy.yml ← deploy alternativo via SSH (non è il flusso principale)
└── chaos-web-player/
    ├── backend/                # Node + Express + Prisma (MySQL)
    ├── frontend/               # Vite + React + TypeScript (dist committato)
    └── deploy/                 # DEPLOY.md + .htaccess.example + post-deploy.sh
```

> Il `plans/` non è nel repo (era gitignored e non è mai stato committato):
> le specifiche vivono in questo README, in `backend/README.md` e in
> `deploy/DEPLOY.md`.

## Stack

- **Frontend**: Vite 8 + React 19 + TypeScript + Tailwind v3 (pinned) + Zustand + React Router v7
- **Backend**: Node 22 (cPanel Stellar prod) + Express 5 + **Prisma 7** con `@prisma/adapter-mariadb` + `mariadb` driver + MySQL 8 + JWT + bcrypt
- **Runtime TS**: **type-stripping nativo di Node** (`node --experimental-strip-types`, nativo da Node ≥ 22.18) per i `.ts` del client Prisma generato — `tsx` non è più una dipendenza
- **Deploy**: Namecheap Stellar (cPanel Application Manager + Git Version Control), subdomain `radio.chaosroom.online`, HTTPS via AutoSSL

## Stato del progetto

| Fase | Stato | Note |
|---|---|---|
| 0 — Setup locale | ✅ | WSL Ubuntu + MySQL locale + portproxy Windows |
| 1 — Backend foundation | ✅ | 11 endpoint REST auth-protected |
| 2 — Backend scripts (scan/seed) | ✅ | Scanner in cron ogni 5' + script Pirate Day (publish/cleanup) + seed dati demo |
| 3 — Frontend setup | ✅ | PWA + manifest + icone |
| 4 — Routing & Auth flow | ✅ | 9 route, ProtectedRoute, hydrate-on-mount |
| 5.1 — Player | ✅ | Audio reale, waveform, controls, Media Session |
| 5.2 — Playlist | ✅ | "SHOW LIST" con riuso TrackListItem |
| 5.3 — Favorites | ✅ | "USER FAVORITES" con riuso TrackListItem + useFavoritesStore |
| 5.4 — Notifications | ✅ | "UPDATES": storico paginato (le lette restano in grigio), notifica "nuovi brani in show list" + Pirate Day + creazione custom via admin |
| 5.5 — Pirate Day | ✅ | Countdown live + progress bar + curator + descrizione con **highlight** |
| 6 — PWA & polish | ✅ | Toast/snackbar globale, LoadingView consistente, EmptyState con varianti, safe-area iOS, auto-logout su 401, feedback errori rete/audio |
| 7 — Deploy | ✅ | **Live su radio.chaosroom.online** |
| 8 — Hardening & bugfix | ✅ | E2E smoke test automatico, Range request reali sullo stream, race condition del player, preferiti a fonte unica, persistenza del player, waveform reali per brano |

### Ultimi interventi (sessione 2026-11-19)

| Area | Cosa |
|---|---|
| **Notifiche: storico** | Le notifiche lette **sparivano** dalla lista (l'endpoint filtrava le broadcast già lette) e quelle target erano sempre `read: true`. Ora `GET /api/notifications` restituisce lo storico paginato `{items, total, page, limit, unreadCount}`: le lette restano in grigio |
| **Notifiche: lettura** | Niente più click-per-notifica: **visitare** la pagina notifiche chiama `POST /api/notifications/read-all` e le marchia tutte come lette (stato per utente in `notification_reads`) |
| **Notifiche: nuovi brani** | Il cron `scan.js` non notificava nulla quando entravano MP3 in libreria. Ora ogni batch di scan con brani nuovi genera una notifica broadcast "Nuovi brani in Show List" (i brani del Pirate Day sono esclusi: hanno già la loro) |
| **Notifiche: creazione custom** | Nuovo `POST /api/notifications` (solo admin, lista `ADMIN_EMAILS`) e `DELETE /api/notifications/:id` per rimuovere un annuncio sbagliato |
| **Notifiche: schema** | `notifications` ha ora `kind` (`NEW_TRACKS`/`PIRATE_DAY`/`CUSTOM`), `title`, `meta`, `dedupeKey` e una **FK verso `users`** (prima `user_id` non era referenziata) |

### Ultimi interventi (sessione 2026-11-14/16)

| Area | Cosa |
|---|---|
| **Deploy: due copie del backend** | `.cpanel.yml` puntava a `$DEPLOY_ROOT/repo/chaos-web-player` mentre l'application root è `$DEPLOY_ROOT/chaos-web-player/backend`: la pipeline aggiornava una copia, Passenger ne eseguiva un'altra → **frontend nuovo + backend vecchio**, e i fix del backend non arrivavano mai. Ora `SOURCE_ROOT` coincide con l'application root e il restart viene verificato con `git.sha` |
| **Preferiti sui brani Pirate Day** | I brani dell'edizione erano preferitabili (nessun 403 lato server) e mostravano un cuore che il backend rifiutava. Ora il server espone `favoriteable` su ogni brano (unico predicato, usato sia per il DTO sia per il 403) e il frontend non renderizza il cuore quando il flag è `false` |
| **Endpoint /api/debug** | Espone `git.sha` (il commit in esecuzione, letto dai file `.git` perché sotto Passenger `git` non è nel PATH) e `env_check.PIRATE_DAY_DIR`: rende verificabile "quale codice sta girando" |
| **Rate limit /auth/\*** | Configurabile con `AUTH_RATE_LIMIT_MAX` (default 5/15min): lo smoke test E2E faceva 7 chiamate `/auth/*` e non poteva mai passare in produzione |
| **Errori 4xx** | Un body JSON malformato rispondeva **500** invece di 400: l'error handler ignorava lo status del body parser. Le richieste abortite dal client (seek/chiusura tab) non vengono più loggate come `[unhandled error]` |

### Ultimi interventi (sessione 2026-11-12/13)

| Area | Cosa |
|---|---|
| **Range request sullo stream** | La route dichiarava `Accept-Ranges: bytes` ma ignorava l'header: ogni seek riscaricava l'intero MP3 (14,5 MB). Ora `res.sendFile()` → `206 Partial Content` + `Content-Range`, e lo stream viene chiuso quando il client abortisce |
| **Race condition del player** | `AbortError` di `play()` trattato come errore fatale (metteva in pausa la traccia appena scelta), `pause` event di `load()` che desincronizzava lo store, `onPlay` che resuscitava la riproduzione dopo un pause. Risolti con generation counter, guard su `readyState` e `.then()` guard sul desired state |
| **Preferiti** | Il cuore teneva uno stato locale duplicato e `useFavoritesStore.toggle()` era codice morto; sul player partiva vuoto e un click su un brano già preferito faceva POST invece di DELETE. Ora lo store è l'unica fonte di verità |
| **Persistenza del player** | Dopo un reload si perdeva brano, coda e posizione. Ora `persist` con scritture throttled a 3 s e seek alla posizione salvata |
| **Waveform reali** | Era un pattern random identico per ogni brano. Ora i picchi sono calcolati lato server (decoder WASM mpg123: su Stellar non c'è ffmpeg) e il frontend li adatta alla larghezza del contenitore |
| **Area di click** | Solo la cover avviava la riproduzione: ora è cliccabile tutta la riga (pattern dello "stretched button") |
| **Lock screen** | Su schermo bloccato i controlli sparivano durante il cambio traccia. Precaricata anche la traccia precedente, rimosso il doppio reset dell'elemento audio, `playbackState`/`positionState` espliciti nella MediaSession |
| **Errori di parsing** | `JSON.parse` non protetto: una risposta HTML del proxy lanciava `SyntaxError` invece di `ApiError` e faceva sfuggire lo status HTTP reale |

## Quickstart (sviluppo locale Windows + WSL)

L'ambiente di sviluppo richiede **WSL Ubuntu** perché il backend Node gira in WSL (con il type-stripping nativo per i `.ts` del client Prisma) e si connette a **MySQL installato in WSL**.

### Setup una tantum (Windows + WSL)

```powershell
# Da PowerShell come amministratore
$wslIp = wsl hostname -I
netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=3001 connectaddress=$wslIp connectport=3001
New-NetFirewallRule -DisplayName "WSL MySQL" -Direction Inbound -LocalPort 3306 -Protocol TCP -Action Allow
```

```bash
# In WSL Ubuntu (wsl -u root)
apt install -y mysql-server
sed -i 's/^bind-address.*=.*127.0.0.1/bind-address = 0.0.0.0/' /etc/mysql/mysql.conf.d/mysqld.cnf
service mysql restart

mysql -e "CREATE DATABASE IF NOT EXISTS chaos_radio;
  CREATE USER IF NOT EXISTS 'chaos_app'@'%' IDENTIFIED WITH mysql_native_password BY 'devpass';
  GRANT ALL PRIVILEGES ON *.* TO 'chaos_app'@'%' WITH GRANT OPTION;
  FLUSH PRIVILEGES;"

# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash
DEBIAN_FRONTEND=noninteractive apt install -y nodejs
```

### Setup progetto

```bash
# Backend
cd chaos-web-player/backend
npm install
cp .env.example .env
# Modifica .env: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET
# (vedi backend/README.md per dettagli)

# Migration
wsl -u root bash -c "cd /mnt/c/.../chaos-web-player/backend && \
  DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=chaos_app DB_PASSWORD=devpass DB_NAME=chaos_radio \
  JWT_SECRET=... npx prisma migrate dev --name init"

# Frontend
cd ../frontend
npm install
npm install react-router-dom zustand lucide-react clsx
npm install -D tailwindcss@^3.4.17 postcss autoprefixer vite-plugin-pwa sharp
npx tailwindcss init -p
node scripts/generate-icons.mjs  # genera icon-192/512 da icon.svg
```

### Avvio dev

```bash
# Backend (in WSL: il type-stripping nativo di Node esegue i .ts del client Prisma)
wsl -u root bash -c "cd /mnt/c/.../chaos-web-player/backend && \
  DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=chaos_app DB_PASSWORD=devpass DB_NAME=chaos_radio \
  JWT_SECRET=... node --experimental-strip-types src/index.js"

# Frontend (da Windows)
cd chaos-web-player/frontend
npm run dev
```

Apri `http://localhost:5173`. Vite proxy inoltra `/api/*` al backend.

> ⚠️ **Importante**: `chaos-web-player/frontend/.env.local` ha `VITE_API_URL=http://localhost:3001/api` per il dev. **MAI committare** questa config: ha priorità su `.env.production` in Vite e renderebbe la build di produzione rotta (vedi "Trappole" sotto).

## Deploy su produzione

**Live**: [https://radio.chaosroom.online](https://radio.chaosroom.online)

Il deploy è completamente Git-based. Vedi **[`deploy/DEPLOY.md`](./deploy/DEPLOY.md)** per la guida completa passo-passo.

In sintesi:
1. cPanel → MySQL® Databases → crea `chaos_radio` + user `chaos_app` (auth plugin `mysql_native_password`, grant `ALL ON *.*`)
2. cPanel → Git Version Control → clone del repo nella root del documento `/home/tuouser/radio.chaosroom.online/` (il repo contiene `.cpanel.yml` + `chaos-web-player/`; **niente sottocartella `repo/`**)
3. cPanel → Setup Node.js App → Node 22 → Application root: `chaos-web-player/backend` → startup: `src/index.js`
4. Setup Environment Variables (9 vars nel pannello, vedi sotto)
5. Setup Node.js App → Run NPM Install (`.cpanel.yml` esegue automaticamente + `touch tmp/restart.txt` per restart Passenger)
6. Applica migration via **phpMyAdmin Import** del file `prisma/migrations/<timestamp>_init/migration.sql`
7. Restart Node app → test `https://radio.chaosroom.online/api/health`

### Env vars

**Due posti, con lo stesso contenuto**, perché l'app e gli script CLI non
vedono le stesse variabili:

| Dove | Per chi | Come |
|---|---|---|
| **pannello** (Setup Node.js App → Environment variables) | l'app Express: legge solo `process.env`, **non** carica `.env` | 9 var (tabella sotto) |
| **`backend/.env`** | gli script CLI e i cron, che girano con `node --env-file=.env` | stesse var + `PIRATE_DAY_*` |

| Nome | Valore | Dove |
|---|---|---|
| `DB_HOST` | `localhost` | pannello + `.env` |
| `DB_PORT` | `3306` | pannello + `.env` |
| `DB_USER` | `chaouaza_chaos_app` (con prefisso username cPanel) | pannello + `.env` |
| `DB_PASSWORD` | [password generata in STEP 1] | pannello + `.env` |
| `DB_NAME` | `chaouaza_chaos_radio` (con prefisso) | pannello + `.env` |
| `JWT_SECRET` | [64 byte hex random] | pannello + `.env` |
| `PORT` | `3001` | pannello + `.env` |
| `NODE_ENV` | `production` | pannello + `.env` |
| `PIRATE_DAY_DIR` | `/home/<user>/radio.chaosroom.online/chaos-web-player/backend/private/audio/pirate-day` (assoluto) | pannello + `.env` |
| `AUTH_RATE_LIMIT_MAX` | opzionale (default 5): quante richieste `/auth/*` ogni 15 min per IP | pannello (o `.env` in dev) |
| `ADMIN_EMAILS` | email degli admin, separate da virgola (default vuoto = **nessuno**): abilita `POST /api/notifications` | pannello (o `.env` in dev) |
| `NOTIFICATIONS_RATE_LIMIT_MAX` | opzionale (default 30): quante notifiche custom ogni ora per IP | pannello (o `.env` in dev) |

Dopo aver cambiato una env var: `touch <application root>/tmp/restart.txt` e
verifica con `curl -s https://radio.chaosroom.online/api/debug` →
`env_check.PIRATE_DAY_DIR` e `git.sha`.

## Caricare brani

Non si inseriscono più righe a mano: c'è lo **scanner** (cron ogni 5') e la
pipeline del **Pirate Day**.

1. **Libreria**: upload dei MP3 in `/home/<user>/radio.chaosroom.online/chaos-web-player/backend/private/audio/` → il cron `scan.js` legge i tag ID3, estrae le cover, calcola le waveform e popola `tracks`; i brani finiscono nella playlist `show-list`. Quando entrano brani nuovi nasce una **notifica broadcast "Nuovi brani in Show List"** (una per batch di scan).
2. **Pirate Day**: upload dei MP3 dell'edizione in `private/audio/pirate-day/` → `npm run pirate-day:init` genera il `manifest.json` (curatore, descrizione, data) → il cron orario `pirate-day.js` pubblica l'edizione (playlist + items + notifica) e, alla scadenza, la ripulisce (file + righe).
3. I brani dell'edizione Pirate Day **non sono preferitabili**: il server li espone con `favoriteable: false` e risponde **403** a `POST /api/favorites/:id`.

Dettagli: `backend/README.md` (scanner) e `deploy/DEPLOY.md` → PARTE D (Pirate Day).

## Notifiche

La tabella "UPDATES" è uno **storico**: le notifiche non spariscono, una volta
lette restano in lista in grigio (prima del passaggio non lette → in evidenza).

**Da dove nascono**

| Origine | Chi la crea | Note |
|---|---|---|
| Nuovi brani in show list | cron `scan.js` (ogni 5') | una notifica per batch di scan, con l'elenco dei brani |
| Nuova edizione Pirate Day | cron `pirate-day.js` (ogni ora) | una notifica per edizione (idempotente) |
| Notifica custom | `POST /api/notifications` | solo admin (`ADMIN_EMAILS`); broadcast o target |

**Stato "letto"**: il solo fatto di **visitare la pagina notifiche** marca
come lette tutte le notifiche visibili (`POST /api/notifications/read-all`).
Non serve cliccare nessuna notifica.

**Scrivere una notifica custom** (solo admin, lista `ADMIN_EMAILS`):

```bash
# 1) login come admin -> il cookie di sessione sta nella risposta
curl -i -X POST https://radio.chaosroom.online/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<admin@email>","password":"..."}'
# 2) crea la notifica (body obbligatorio; userId = null -> broadcast)
curl -X POST https://radio.chaosroom.online/api/notifications \
  -H "Content-Type: application/json" \
  -b "token=<JWT>" \
  -d '{"title":"Palinsesto","body":"La puntata di venerdì inizia alle 22:30."}'
```

> Guida completa (payload, codici di errore, esempi, test, troubleshooting):
> [`docs/notifications.md`](docs/notifications.md).

## Trappole note (le "lesson learned" del deploy)

Queste sono state tutte risolte e documentate per evitare di rifare gli stessi errori:

1. **Prisma 7 WASM binary non si scarica su Stellar shared**: il `prisma generate` durante `npm install` fallisce perché Stellar blocca il download dei binari WASM. Fix: rimosso `postinstall: prisma generate`, committato `generated/prisma/` direttamente nel repo. La build iniziale (sul laptop dev) genera il client, poi viene committato.

2. **Passenger cache + `dotenv`**: cPanel Application Manager cachia il vecchio file JS in memoria anche dopo Stop/Start. L'errore `Cannot find package 'dotenv'` persisteva finché non si è aggiunto `dotenv` di nuovo a `dependencies` (workaround). Lezione: **MAI usare `import "dotenv/config"` su cPanel shared**. Le env vars dell'app vanno solo nel pannello Environment Variables (il backend non carica `.env`); il file `.env` serve solo agli script CLI e ai cron, che lo leggono con `--env-file`.

3. **`VITE_API_URL` hardcoded in build**: `.env.local` (dev) ha priorità su `.env.production` in Vite. Se `.env.local` ha `http://localhost:3001/api`, la build di produzione punterà a localhost → 404. Fix: `.env.local` vuoto (commentato), `.env.production` vuoto → build usa default `/api` (relativo). **Ogni volta che modifichi `.env.local`, rebuilda il frontend.**

4. **Dopo `git push`, aspettare 30+ secondi prima di testare** (cPanel Passenger ha cache aggressiva). Usa `curl -s https://radio.chaosroom.online/api/debug` per verificare che il nuovo codice sia in esecuzione.

5. **`.cpanel.yml` viene eseguito automaticamente da cPanel Git Version Control** al pull. Crea le cartelle `private/`, installa deps, e fa `touch tmp/restart.txt` per restart Passenger.

6. **`.gitignore` locale di Vite annulla l'eccezione di deploy** (commit `475ad1c`): `chaos-web-player/frontend/.gitignore` (Vite-generated) ha `dist/` che **sovrascrive** l'eccezione `!chaos-web-player/frontend/dist/` del `.gitignore` root. Risultato: i vecchi `dist/assets/*` e i font `.woff/.woff2` già tracciati venivano committati, ma i **nuovi bundle** generati da `npm run build` venivano bloccati silenziosamente. L'`index.html` committato referenziava i nuovi hash, ma quei file non esistevano nel repo → 404 in produzione → pagina completamente bianca. Fix: aggiunto `!dist/` anche nel `.gitignore` locale per ripristinare l'eccezione. **Regola operativa**: dopo ogni `npm run build`, controllare con `git ls-files --others --exclude-standard dist/`: se è vuoto ma `dist/index.html` cita nuovi hash `index-XXXX.js/.css`, il `.gitignore` sta bloccando i nuovi asset — aggiungere `!dist/` nel `.gitignore` locale della sotto-cartella.

7. **Il deploy rilassava il backend solo alla fine**: la vecchia pipeline ricostruiva il frontend (1-2 minuti) e solo DOPO toccava `tmp/restart.txt`. Verificando `/api/debug` troppo presto si vedeva il processo **vecchio** (stesso `pid`, uptime in crescita) e si concludeva che "il deploy non ha funzionato". Ora la pipeline **non ricostruisce il frontend** (il `dist` è committato) → il restart arriva in pochi secondi. **Regola operativa**: dopo "Update from Remote", attendere che il deploy finisca e verificare con `curl -s https://radio.chaosroom.online/api/debug`: il segnale che il backend è stato ricaricato è un `pid` diverso, `uptime` azzerato e `git.sha` = commit appena pushato.

8. **`Accept-Ranges: bytes` senza implementarlo è peggio che non dichiararlo**: la route dichiarava il supporto Range ma ignorava l'header, così il browser si metteva in modalità range e riceveva un 200 pieno — un download da 14,5 MB a ogni seek. Dichiarare `Accept-Ranges` solo se si risponde davvero con 206.

9. **Su Stellar non c'è ffmpeg**, e i brani sono CBR 320 kbps: l'euristica "dimensione del frame ∝ energia" dà una linea piatta. Per generare waveform reali serve un decoder in-process (`mpg123-decoder`, build WASM). Verificare sempre cosa c'è sull'host (`GET /api/debug` → `tools`).

10. **Le migrazioni su Stellar non sono affidabili**: `prisma migrate deploy` usa lo stesso motore del client WASM di Prisma 7, che su quell'hosting non si scarica. Per questo la waveform è un **file** in `private/` e non una colonna: una colonna mancante farebbe fallire tutte le query su `tracks` e porterebbe giù l'app. Prima di aggiungere una colonna, pensare a cosa succede se la migration non viene applicata.

11. **`private/` non era gitignorato**: i MP3 originali e i file derivati (cover, waveform) avrebbero potuto finire nel repo. Ora è in `backend/.gitignore`.

12. **Due copie del backend (frontend nuovo, backend vecchio)**: `SOURCE_ROOT` in `.cpanel.yml` puntava a `$DEPLOY_ROOT/repo/chaos-web-player`, ma l'application root del Node.js App è `$DEPLOY_ROOT/chaos-web-player/backend`: la pipeline aggiornava una copia, il server ne eseguiva un'altra. Risultato: le correzioni del backend (es. il 403 sui preferiti dei brani Pirate Day) non arrivavano mai in produzione, mentre la UI sembrava aggiornata. **Regola operativa**: `SOURCE_ROOT` deve coincidere con il parent dell'application root (`$DEPLOY_ROOT/chaos-web-player`, senza `/repo`); dopo ogni deploy controllare `curl -s https://radio.chaosroom.online/api/debug` → `cwd` e `git.sha` (il SHA del commit in esecuzione).

## Script utili

| Path       | Script       | Azione |
|------------|--------------|--------|
| `backend/` | `npm run dev` | `node --experimental-strip-types --watch src/index.js` su 3001 (WSL, dev) |
| `backend/` | `npm start` | `node --experimental-strip-types src/index.js` in produzione (Node ≥ 22.6) |
| `backend/` | `npm run scan` | scansiona i MP3, estrae tag/cover e calcola le waveform mancanti |
| `backend/` | `npm run waveforms` | calcola solo le waveform mancanti (`-- --force` per ricalcolare tutte) |
| `backend/` | `npm run pirate-day` | pubblica l'edizione Pirate Day dal manifest (o la ripulisce se scaduta) |
| `backend/` | `npm run pirate-day:init` | genera/aggiorna `manifest.json` (curatore, descrizione, data di pubblicazione) |
| `backend/` | `npm run test:smoke` | E2E smoke test contro il server (auth, tracks, favorites, playlists, notifications, Range request, waveform, regole Pirate Day) |
| `backend/` | `npm run prisma:studio` | GUI Prisma per ispezionare il DB |
| `frontend/`| `npm run dev` | Vite dev server su 5173 (proxy `/api` a :3001) |
| `frontend/`| `npm run build` | build produzione in `dist/` (**committato**: è il bundle che il server serve) |
| `frontend/`| `node scripts/generate-icons.mjs` | rigenera PWA icons da icon.svg |

## Note operative

- **Dopo un riavvio di WSL**, l'IP cambia. Ri-eseguire il blocco `netsh portproxy` con il nuovo IP.
- **TypeScript a runtime**: Node esegue i `.ts` del client Prisma con il **type-stripping nativo** (`--experimental-strip-types`, default da Node ≥ 22.18). `tsx` non è più una dipendenza.
- **Secrets**: in dev stanno in `.env` (gitignored). In produzione l'app li prende dal **pannello cPanel**; i **cron** li prendono da `backend/.env` (che non è committato). Le due copie vanno tenute allineate.
- **Il DB di sviluppo (WSL) ha `caching_sha2_password` sostituito con `mysql_native_password`** per compatibilità con il driver MariaDB.
- **`dotenv` è in `dependencies` ma non viene importato dal backend**: restarebbe per il solo `prisma7.config.ts` e per gli script CLI. **MAI** usare `import "dotenv/config"` in `src/` su cPanel shared (vedi trappola 2).

## Riferimenti

- README backend: [`backend/README.md`](./backend/README.md)
- README frontend: [`frontend/README.md`](./frontend/README.md)
- Script CLI: [`backend/scripts/README.md`](./backend/scripts/README.md)
- Guida deploy: [`deploy/DEPLOY.md`](./deploy/DEPLOY.md)
- Live: [https://radio.chaosroom.online](https://radio.chaosroom.online)
