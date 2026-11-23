# Chaos Radio — Deploy su Namecheap Stellar

**Data preparazione**: 2026-10-07
**Ultimo aggiornamento**: 2026-11-16 (frontend servito dall'app Express dal `dist` committato; `SOURCE_ROOT` senza `/repo`; `PIRATE_DAY_DIR` assoluto)
**Versione**: MVP completo (Fasi 0-8 completate)
**Target**: subdomain `radio.chaosroom.online`

> ⚠️ **Prima di iniziare**: assicurati di avere accesso a cPanel di Namecheap Stellar con i permessi per creare DB, gestire Setup Node.js App, e usare Git Version Control.

---

## Cosa viene deployato

| Componente | Stato | Note |
|---|---|---|
| Frontend (PWA) | ✅ in produzione | Il `dist/` è **committato**: il server lo serve da `chaos-web-player/frontend/dist` (Express static). La build la fai in locale, poi committi |
| Backend API | ✅ in produzione | Tutti gli endpoint auth/tracks/favorites/playlists/notifications + `/api/debug` |
| Auth (login/register/logout) | ✅ testato in produzione | Cookie httpOnly + JWT, rate limit 5/15min per IP |
| Player audio | ✅ funzionante | Streaming MP3 con Range request (seek senza riscaricare il file) + waveform reale per brano |
| Playlist | ✅ funzionante | "SHOW LIST" popolata dallo scanner (cron ogni 5') |
| Favorites | ✅ completo | `GET/POST/DELETE /api/favorites`; i brani del Pirate Day hanno `favoriteable: false` e il server risponde **403** |
| Notifications | ✅ completo | Storico paginato in `GET /api/notifications` + `POST /api/notifications` (solo admin) + `POST /api/notifications/read-all` |
| Scan + Seed scripts | ✅ in produzione | `scripts/scan.js` (cron ogni 5') + `scripts/pirate-day.js` (cron orario) |
| Pirate Day | ✅ completo | Countdown live + progress bar + curator + descrizione con highlight + edizioni da manifest (publish e cleanup automatici) |

---

## Architettura finale su Stellar

```
https://radio.chaosroom.online/
├── /                  → static (Vite build, serve index.html)
├── /assets/*          → static (JS, CSS, fonts)
├── /icon-*.png        → static (PWA icons)
├── /manifest.webmanifest → static (PWA manifest)
├── /sw.js              → static (PWA service worker)
└── /api/*              → route Node.js (backend)
```

> Tutto (frontend **e** API) è servito dall'**app Express**: il `.htaccess`
> del doc root è solo il blocco di configurazione Passenger generato da
> CloudLinux, senza rewrite. I file statici arrivano da
> `chaos-web-player/frontend/dist` (il `dist` committato) con
> `Cache-Control: immutable` sui bundle con hash e `no-cache` su
> `index.html`/`sw.js`.

Sul server Stellar la struttura è:
```
/home/tuouser/radio.chaosroom.online/     ← ROOT DEL CLONE GIT (= doc root)
├── .htaccess                          ← config Passenger (CloudLinux, NON committato)
├── .cpanel.yml                        ← pipeline di deploy
├── chaos-web-player/                  ← il pacchetto del repo
│   ├── backend/                       ← APPLICATION ROOT del Node.js App
│   │   ├── private/audio/             ← MP3 (libreria + edizioni Pirate Day)
│   │   └── tmp/restart.txt            ← marker di restart Passenger
│   └── frontend/
│       └── dist/                      ← build Vite COMMITTATA (quello che serve)
└── tmp/                               ← restart.txt (convenzione alternativa)
```

> ⚠️ **Il clone git è la root del documento, NON una sottocartella `repo/`.**
> `SOURCE_ROOT` in `.cpanel.yml` è `$DEPLOY_ROOT/chaos-web-player`: è
> esattamente il ramo che contiene l'`application root` del Node.js App
> (`chaos-web-player/backend`). Se `SOURCE_ROOT` punta a una copia diversa,
> la pipeline aggiorna il frontend ma **non** il backend che gira: in
> produzione restano due versioni del codice (frontend nuovo, backend
> vecchio) e i fix del backend non arrivano mai.
>
> Come verificare quale codice sta girando:
> `curl -s https://radio.chaosroom.online/api/debug` → il campo `cwd` deve
> essere `/home/<user>/radio.chaosroom.online/chaos-web-player/backend`.

---

# PARTE A — Setup iniziale (una tantum)

## STEP 1 — Crea database MySQL (cPanel)

1. Login cPanel: `https://chaosroom.online:2083` (o via Namecheap dashboard)
2. Sezione **Databases** → **MySQL® Databases**
3. **Create New Database**:
   - Database name: `chaos_radio` (diventerà `tuouser_chaos_radio`)
4. **Create New User**:
   - Username: `chaos_app` (diventerà `tuouser_chaos_app`)
   - Password: **Password Generator** → copia e salva la password in un posto sicuro
5. **Add User to Database**:
   - Seleziona `ALL PRIVILEGES` → **Make Changes**

**Annotati**:
- DB host: `localhost`
- DB completo: `tuouser_chaos_radio`
- User completo: `tuouser_chaos_app`
- Password: [salvata]

## STEP 2 — Crea repository GitHub (privato)

1. Vai su https://github.com/new
2. **Repository name**: `chaos-radio` (o nome che preferisci)
3. **Visibilità**: Private (consigliato per ora)
4. **NON** inizializzare con README/.gitignore/license (li abbiamo già)
5. Click **Create repository**
6. GitHub ti mostrerà l'URL: `https://github.com/TUO-USERNAME/chaos-radio.git`

## STEP 3 — Genera Personal Access Token (per push)

Le password GitHub non funzionano più. Serve un PAT:

1. https://github.com/settings/tokens
2. **Generate new token** → **Fine-grained tokens**
3. Name: `namecheap-deploy`
4. Expiration: 90 giorni
5. **Repository access**: solo `chaos-radio` (quello appena creato)
6. **Permissions → Repository**: `Contents: Read and Write`
7. Click **Generate token**
8. **COPIA IL TOKEN** (non potrai più rivederlo, solo rigenerare)

## STEP 4 — Push del codice locale al repo GitHub

Da terminale (PowerShell o cmd) nella cartella del workspace:

```bash
cd "C:\Users\GGsabani\Desktop\chaos web player"

# Configura git con le tue credenziali (solo per il primo push)
git config --global user.name "Il Tuo Nome"
git config --global user.email "la-tua-email@example.com"

# Aggiungi il remote (sostituisci TUO-USERNAME)
git remote add origin https://github.com/TUO-USERNAME/chaos-radio.git

# Verifica
git remote -v

# Push iniziale (ti chiederà username + PAT come password)
git push -u origin master
```

**Nota**: alla richiesta password incolla il PAT del passo 3, non la password GitHub.

Il branch del repo è **`master`** (è quello che il server clona e che
`.github/workflows/deploy.yml` usa). Se il tuo clone ha un branch diverso:
```bash
git branch -M master
git push -u origin master
```

## STEP 5 — Clona il repo in cPanel (Git Version Control)

> ℹ️ **Il clone va nella root del documento** (`/home/tuouser/radio.chaosroom.online`),
> così il repo contiene `.cpanel.yml` + `chaos-web-player/` e l'`application root`
> (`chaos-web-player/backend`) coincide con il codice che la pipeline aggiorna.
> I file preesistenti del doc root (`.htaccess`, `frontend/`, `tmp/`) non
> vengono toccati dal clone: per questo `.htaccess` va creato DOPO il clone
> (e non è committato).

1. cPanel → **Files** → **Git Version Control**
2. Click **Create**
3. Compila:
   - **Clone URL**: `https://github.com/TUO-USERNAME/chaos-radio.git`
   - **Repository path**: `/home/tuouser/radio.chaosroom.online` ← **la root del documento, senza `/repo`**
   - **Branch**: `master`
   - **Deployment**: lascia vuoto (usa il .cpanel.yml del repo)
4. Click **Create**
5. Aspetta che il clone finisca (30-60 secondi)
6. Verifica in File Manager: `/home/tuouser/radio.chaosroom.online/chaos-web-player/backend/` deve esistere

> ⚠️ Se il clone non entra nella root (file preesistenti), il path alternativo
> `/home/tuouser/radio.chaosroom.online/repo` va usato **insieme** a
> `SOURCE_ROOT=$DEPLOY_ROOT/repo/chaos-web-player` in `.cpanel.yml`, e
> l'application root del Node.js App deve puntare a
> `radio.chaosroom.online/repo/chaos-web-player/backend`. Le due copie
> (root e `repo/`) non possono coesistere: il backend che gira deve essere
> quello che la pipeline aggiorna.

## STEP 6 — Trigger primo deploy (esegue .cpanel.yml)

Torna in **Git Version Control** → la tua repo → click **Pull or Deploy** → **Update from Remote**

Questo esegue il `.cpanel.yml`:
- `npm install --production` in backend
- `npx prisma generate` e `npx prisma migrate deploy` (su Stellar falliscono: il client è committato e le migration si applicano da phpMyAdmin → la pipeline prosegue comunque)
- Creazione delle cartelle `private/` e `logs/`
- **Nessuna build del frontend**: il `dist` è committato e arriva con il pull (l'app Express lo serve da `chaos-web-player/frontend/dist`)
- Touch `tmp/restart.txt` (restart Passenger)

Tempo: pochi secondi. Controlla i log nel pannello per errori.

## STEP 7 — Crea `backend/.env` con credenziali produzione

cPanel → **File Manager** → `/home/tuouser/radio.chaosroom.online/chaos-web-player/backend/`

(Sostituisci `tuouser` col tuo username reale, es. `chaouaza`)

Click **+ File** → nome `.env` → **Create New File**. Contenuto:

```env
# MySQL production
DB_HOST=localhost
DB_PORT=3306
DB_USER=chaouaza_chaos_app
DB_PASSWORD=LA_PASSWORD_GENERATA_ALLO_STEP_1
DB_NAME=chaouaza_chaos_radio

# JWT — genera con: openssl rand -hex 64
JWT_SECRET=INSERISCI_QUI_OUTPUT_DI_OPENSSL_RAND_HEX_64

PORT=3001
NODE_ENV=production

# Admin autorizzato a creare notifiche custom (POST /api/notifications).
# Se assente, l'endpoint è chiuso a tutti.
ADMIN_EMAILS=admin@chaosroom.online
```

> ⚠️ Il file NON verrà sovrascritto dai prossimi pull (è in `.gitignore`).

> ℹ️ `ADMIN_EMAILS` va messo **anche** nel pannello (Setup Node.js App →
> Environment variables): l'app Express non carica `.env`.

## STEP 7b — Applica le migration al DB

> Il client Prisma è già committato in `backend/generated/prisma/`, ma serve
> comunque applicare le migration al DB.

**Opzione A (consigliata) — `apply-migrations.mjs` via SSH**

Su Stellar il motore WASM di Prisma 7 non si scarica, quindi
`prisma migrate deploy` non funziona. Le migration sono però SQL puro e si
possono applicare con il driver `mariadb` già presente nelle dipendenze:

```bash
ssh -i ~/.ssh/id_ed25519 -p 21098 chaouaza@198.177.120.31
cd /home/chaouaza/radio.chaosroom.online/chaos-web-player/backend
/home/chaouaza/nodevenv/radio.chaosroom.online/chaos-web-player/backend/22/bin/node \
  --env-file=.env scripts/apply-migrations.mjs
```

Lo script è **idempotente** (le parti già applicate vengono saltate) e tiene
traccia delle migration applicate in `schema_migrations`. Dettagli:
`backend/scripts/README.md` → *apply-migrations.mjs*.

**Opzione B — import da phpMyAdmin (senza SSH)**

1. cPanel → **Databases** → **phpMyAdmin**
2. Click sulla tabella `chaouaza_chaos_radio` (o `chaos_radio` se non hai prefisso) nella sidebar sinistra
3. Click tab **Import** in alto
4. Click **Choose File** → naviga a `/home/chaouaza/radio.chaosroom.online/chaos-web-player/backend/prisma/migrations/20261006105522_init/migration.sql`
5. Click **Go** in fondo alla pagina
6. Verifica che le 7 tabelle siano presenti nella sidebar: `users`, `tracks`, `favorites`, `playlists`, `playlist_items`, `notifications`, `notification_reads`

> ⚠️ **Ogni nuova migration va applicata a mano, una per una, in ordine.**
> Con l'Opzione A (`apply-migrations.mjs`) è automatico; con l'Opzione B
> (phpMyAdmin) va importata dalla più vecchia alla più recente. Al momento:
> - `20261006105522_init` (schema iniziale)
> - `20261119173000_notification_history_kind` (notifiche: colonne `kind`,
>   `title`, `meta`, `dedupe_key`, indice `user_id+created_at`, FK
>   `notifications.user_id → users.id`)
>
> **La notifica "nuovi brani" e quella Pirate Day funzionano anche senza la
> migration** (usano solo `body`), ma senza `kind`/`title` la UI non mostra
> l'etichetta dell'origine e le notifiche custom non hanno `title`.

## STEP 8 — Setup Node.js App (Application Manager)

> ℹ️ **SSH è disponibile** su questo account (porta 21098: cPanel → SSH Access →
> Access Details). Da lì si lanciano gli script e si applicano le migration con
> `apply-migrations.mjs` (STEP 7b, Opzione A). Il pannello "Run NPM Script"
> invece va evitato: quel runner avvia node con limiti LVE più stretti e Node
> non riesce ad allocare la WebAssembly del type-stripping. Abbiamo comunque
> rimosso `postinstall: prisma generate` e committato il client Prisma
> generato (`backend/generated/prisma/`) nel repo, così la pipeline non ha
> bisogno di `prisma generate`.

1. cPanel → **Software** → **Setup Node.js App**
2. Click **Create Application**:
   - **Node.js version**: scegli **22.x** o la più recente disponibile
   - **Application mode**: Production
   - **Application root**: `radio.chaosroom.online/chaos-web-player/backend` (la copia che la pipeline aggiorna — **senza `/repo`**)
   - **Application URL**: `radio.chaosroom.online`
   - **Application startup file**: `src/index.js`
3. Click **Create**
4. Nella card dell'app, prendi nota del percorso **Virtual environment** (es. `/home/chaouaza/nodevenv/radio.chaosroom.online/22`)
5. Click **Run NPM Install** (senza `postinstall` → dovrebbe completare OK)
6. Click **Restart** per avviare

> Node 22 con type-stripping nativo esegue i `.ts` del client Prisma senza
> dipendenze aggiuntive (`tsx` non è in `package.json`): da Node 22.18 il
> flag `--experimental-strip-types` non serve nemmeno.

## STEP 9 — `.htaccess`: cosa serve davvero

Su Stellar **non** c'è un `.htaccess` da scrivere a mano: il pannello
"Setup Node.js App" genera il file con la configurazione Passenger
(`PassengerAppRoot`, `PassengerStartupFile`, …). Il suo contenuto è:

```apache
# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION BEGIN
PassengerAppRoot "/home/chaouaza/radio.chaosroom.online/chaos-web-player/backend"
PassengerBaseURI "/"
PassengerNodejs "/home/chaouaza/nodevenv/radio.chaosroom.online/chaos-web-player/backend/22/bin/node"
PassengerAppType node
PassengerStartupFile src/index.js
# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION END
```

> ⚠️ **Non aggiungere rewrite Apache**: il frontend e le API sono serviti
> dall'app Express, che fa anche la SPA fallback (`index.html` per ogni
> path non-file) e i header di cache. Le regole di rewrite in
> `deploy/.htaccess.example` servono solo su host **senza** Passenger
> (Apache puro): lì il document root deve puntare a
> `chaos-web-player/frontend/dist` e `/api/*` va proxato a `:3001`.
>
> Se il `.htaccess` del doc root contiene ancora le regole di rewrite
> mentre gira Passenger, i due livelli si sovrappongono: toglile e lascia
> fare tutto a Express.

---

# PARTE B — Workflow di update

## Update del codice (dopo modifiche locali)

```bash
cd "C:\Users\GGsabani\Desktop\chaos web player"

# Verifica cosa è cambiato
git status

# Se hai toccato il frontend: build + commit del dist (È il bundle che
# il server serve, non viene ricostruito lì)
cd chaos-web-player/frontend && npm run build && cd ../..

# Commit
git add .
git commit -m "feat: descrizione delle modifiche"

# Push (branch master)
git push origin master
```

## Trigger del deploy su cPanel

1. cPanel → **Git Version Control** → la tua repo
2. Click **Pull or Deploy** → **Update from Remote**
3. La `.cpanel.yml` installa le dipendenze e tocca `tmp/restart.txt` (pochi secondi: **non** ricostruisce il frontend)
4. Verifica: `curl -s https://radio.chaosroom.online/api/debug` → `pid` nuovo, `uptime` azzerato, `git.sha` = commit appena pushato

## Update delle env vars

Le env vars dell'app stanno nel **pannello** (Setup Node.js App →
Environment variables); il file `backend/.env` serve solo agli script CLI e
ai cron (`node --env-file=.env`).

1. Pannello → Setup Node.js App → Environment variables → modifica
2. Oppure File Manager → `/home/tuouser/radio.chaosroom.online/chaos-web-player/backend/.env` (per i cron)
3. Restart: `touch /home/tuouser/radio.chaosroom.online/chaos-web-player/backend/tmp/restart.txt`
4. Verifica: `curl -s https://radio.chaosroom.online/api/debug` → `env_check`

## Update solo del backend

La pipeline **non** ricostruisce il frontend: il `dist` è committato e
arriva con il pull. Quindi ogni deploy aggiorna backend e frontend insieme,
in pochi secondi.

---

# PARTE C — Verifica

Apri `https://radio.chaosroom.online`:

- [ ] Pagina mostra logo Chaos Radio + form login
- [ ] SSL valido (lucchetto verde)
- [ ] Clicca "Registrati" → form registrazione funziona
- [ ] Dopo registrazione → redirect a `/player`
- [ ] Player: brano in play, waveform reale, seek senza ricaricare tutto
- [ ] BottomNav → "Playlist": la SHOW LIST elenca i brani della libreria
- [ ] BottomNav → "Pirate Day": countdown + progress bar + curator + brani dell'edizione (se c'è un'edizione attiva; altrimenti empty state "Nessuna playlist attiva")
- [ ] **I brani del Pirate Day NON hanno il cuore** e `POST /api/favorites/<id>` risponde **403**
- [ ] Favorites: il cuore sui brani normali funziona (aggiungi → compare in "USER FAVORITES" → rimuovi)
- [ ] Notifications → lista delle notifiche (storico: le lette restano in grigio); visiting la pagina le marca come lette
- [ ] Logout → redirect a `/login`

Test API:
```bash
curl https://radio.chaosroom.online/api/health
# → {"status":"ok",...}

curl -s https://radio.chaosroom.online/api/debug
# → {"pid":...,"git":{"sha":"..."},"env_check":{...}}   ← il commit in esecuzione

curl -X POST https://radio.chaosroom.online/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'
```

Smoke test completo (inclusi i check Pirate Day):
```bash
cd chaos-web-player/backend
SMOKE_BASE_URL=https://radio.chaosroom.online npm run test:smoke
```

---

# PARTE D — Pirate Day (evento settimanale)

Il Pirate Day non è più una riga di DB creata a mano: è un **evento a
tempo** governato da una cartella di MP3 + un manifest JSON.

## Layout su disco

```
backend/private/
├── audio/                          # MUSIC_DIR — libreria (show list)
│   ├── *.mp3
│   └── pirate-day/                 # MP3 dell'edizione (DENTRO MUSIC_DIR!)
│       ├── manifest.json           # ordine + curatore + data dell'edizione
│       ├── 01 - brano.mp3
│       └── _archive/               # opzionale: manifest-<edition>.json
├── covers/                         # cover-<hash>.jpg
├── waveforms/                      # waveform-<trackId>.txt
└── avatars/                        # curator-<edition>.<ext> (avatar del curatore)
```

> ⚠️ **La cartella `pirate-day/` DEVE stare dentro `private/audio/`.**
> Fuori, `scan.js` la tratterebbe come track orfani e cancellerebbe i brani
> ogni 5 minuti (`scan.js` elimina ogni track il cui file non è più in
> `MUSIC_DIR`), e le waveform non verrebbero mai calcolate.

L'avatar del curatore sta in `private/avatars/` ed è servito dalla rotta
**pubblica** `GET /api/avatars/:file` (whitelist sul nome:
`curator-<edition>.<png|jpg|jpeg|webp|avif>`). Nel manifest si mette la URL
relativa `/api/avatars/curator-25.jpg`. La cartella va creata a mano sul
server (o con `mkdir -p`): non è nel `.cpanel.yml`.

## STEP 1 — Creare il manifest

Il manifest lo genera `scripts/pirate-day-init.js` (vedi STEP 1b). Se lo
scrivi a mano, il formato è:

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
    "avatar": null,
    "links": { "spotify": "https://…", "soundcloud": "https://…" }
  },
  "tracks": ["01 - brano.mp3", "02 - brano.mp3"]
}
```

| Campo | Serve | Destinazione |
|---|---|---|
| `edition` | numero dell'edizione | slug `pirate-day-<edition>` |
| `publishAt` | quando l'edizione è dovuta | `playlists.starts_at` |
| `durationHours` | durata "in onda" | `playlists.ends_at` |
| `description` | testo con `**bold**` | `playlists.description` |
| `curator` | profilo | `curator_name/role/avatar/links` |
| `tracks[]` | ordine dei brani | `playlist_items.position` — **se omesso, viene derivato dalla cartella** (ordine alfabetico) |

`links` è un **oggetto** `{spotify: url}`: è il formato che il frontend si
aspetta (un array farebbe crashare `CuratorCard`).

## STEP 1b — Generare il manifest (SSH o "Run JS Script")

> ⚠️ **Su Stellar non usare "Run NPM Script"**: quel runner avvia node con
> limiti LVE più stretti e Node non riesce ad allocare la WebAssembly del
> type-stripping → `RangeError: WebAssembly.Instance(): Out of memory`.
> Da **SSH** e da **cron** lo stesso script funziona (verificato in
> produzione il 14/11/2026).

**Accesso SSH** (cPanel → SSH Access → Access Details):

```
Server IP: 198.177.120.31
Username:   chaouaza
SSH port:   21098
```

```bash
ssh -i ~/.ssh/id_ed25519 -p 21098 chaouaza@198.177.120.31
cd /home/chaouaza/radio.chaosroom.online/chaos-web-player/backend
/home/chaouaza/nodevenv/radio.chaosroom.online/chaos-web-player/backend/22/bin/node \
  --env-file=.env --experimental-strip-types scripts/pirate-day-init.js
```

Su cPanel, in alternativa, il pulsante **Run JS Script** della card "Setup
Node.js App" avvia un file JS dell'application root (path:
`scripts/pirate-day-init.js`) — ma funziona solo con l'app Express **ferma**,
perché con l'app attiva Node non trova spazio per la WebAssembly.

Lo script genera il manifest con:

- i brani presenti in cartella (ordine alfabetico = ordine curato);
- il numero di edizione successivo;
- la data = prossimo "venerdì 22:00" Europe/Rome;
- la **descrizione**, che è la stessa per tutte le edizioni e quindi sta
  nell'env var `PIRATE_DAY_DESCRIPTION` (i `\n` diventano a capo);
- il **curatore**, che invece cambia a ogni edizione: viene ripreso dal
  manifest (l'edizione precedente) e **lo editi a mano** nel manifest.

Dopo il run, apri `private/audio/pirate-day/manifest.json` dal File Manager
e cambia **solo il curatore**. Il manifest precedente viene archiviato in
`_archive/manifest-<edition>.json`.

Se il manifest descrive un'edizione **non ancora pubblicata**, lo script non
lo sovrascrive (protegge la programmazione): per farlo comunque serve
`--force`, che si passa solo da SSH/cron.

**Env var utili** (da impostare in cPanel → Setup Node.js App → Environment
variables, oppure in `backend/.env`):

| Var | Serve |
|---|---|
| `PIRATE_DAY_DESCRIPTION` | la descrizione, uguale per tutte le edizioni |
| `PIRATE_DAY_CURATOR_NAME` / `_ROLE` / `_AVATAR` / `_LINKS` | curatore di riserva (solo per la prima edizione) |
| `PIRATE_DAY_INIT_PUBLISH_AT` | data di pubblicazione, se non vuoi il calcolo automatico |
| `PIRATE_DAY_INIT_WEEKDAY` / `_HOUR` / `_TZ` | giorno, ora e fuso della pubblicazione |

> Attenzione: le env var che servono ai **cron** (`PIRATE_DAY_DIR`,
> `PIRATE_DAY_MANIFEST`, `PIRATE_DAY_WINDOW_HOURS`) vanno in
> `backend/.env`, perché i cron girano fuori dal contesto dell'app e non
> vedono quelle impostate nel pannello.

### `PIRATE_DAY_DIR` va impostata in **due** posti, con lo stesso path

La cartella del Pirate Day è il punto in cui l'app Express e gli script CLI
devono essere d'accordo: l'app decide se un brano è "pirate day" (quindi non
preferitabile, `isPirateDayPath`), gli script decidono cosa pubblicare e cosa
ripulire. Se i due path divergono, un brano è pirata per uno e non per
l'altro.

| Dove | Perché | Valore |
|---|---|---|
| **pannello** (Setup Node.js App → Environment variables) | l'app Express non carica `.env`: legge solo `process.env` | `/home/<user>/radio.chaosroom.online/chaos-web-player/backend/private/audio/pirate-day` |
| **`backend/.env`** | i cron girano con `node --env-file=.env` | idem, path assoluto |

Usare il path **assoluto**: il default `private/audio/pirate-day` viene
risolto rispetto al cwd, che per l'app è l'application root e per gli script
la loro cartella — oggi coincidono, ma non è garantito.

> Il pannello CloudLinux salva le env vars in
> `~/.cl.selector/node-selector.json` (chiave `env_vars`): si può modificare
> da lì da SSH, ma **il pannello è la fonte di verità** — se lo si edita a
> mano, la prossima modifica dal pannello può sovrascriverlo.
>
> Dopo aver cambiato una env var: `touch <application root>/tmp/restart.txt`
> (ricarica Passenger) e verifica con
> `curl -s https://radio.chaosroom.online/api/debug` → campo `env_check`.

> Lo script fa il chdir sull'application root e si rilancia da solo con
> `--experimental-strip-types` se il Node in uso non sa importare i `.ts`
> (client Prisma). Su Node ≥ 22.18 non serve: il type stripping è attivo
> di default.

## STEP 2 — Caricare i MP3

File Manager (o FTP) → stessa cartella `pirate-day/` → upload dei `.mp3`.
I nomi dei file devono corrispondere **esattamente** a quelli elencati in
`manifest.json` (l'ordine della playlist è quello del manifest).

## STEP 3 — Cron

cPanel → **Cron Jobs** → nuova job (oraria, il manifest decide il giorno):

```
0 * * * * cd /home/USER/radio.chaosroom.online/chaos-web-player/backend && /usr/bin/node --env-file=.env --experimental-strip-types scripts/pirate-day.js >> logs/pirate-day.log 2>&1
```

- Il giorno e l'ora **non** stanno nel cron: sta nel manifest (`publishAt`).
  Per cambiare il giorno basta modificare il manifest: il prossimo tick
  pubblica l'edizione nel nuovo giorno/ora.
- Da evitare `0 0 */7 * *`: il giorno del mese si azzera a ogni mese →
  intervalli irregolari (31→1 = 1 giorno, 1→8 = 7 giorni).
- Con il cron orario il cleanup (24h) avviene entro ~1h dalla scadenza.
  `scan.js` (ogni 5') ripara comunque il DB se un file sparisce per un
  motivo diverso.

C'è anche da configurare (una tantum) il cron dello scanner:

```
*/5 * * * * cd /home/USER/radio.chaosroom.online/chaos-web-player/backend && /usr/bin/node --env-file=.env --experimental-strip-types scripts/scan.js >> logs/scan.log 2>&1
```

`scan.js` mantiene anche la playlist `show-list` (i brani del Pirate Day non
ci finiscono).

## STEP 4 — Cosa succede in pratica

| Momento | Cosa fa `pirate-day.js` |
|---|---|
| `now < publishAt` | non pubblica nulla (il cleanup prosegue) |
| `now >= publishAt` | pubblica l'edizione: playlist + `playlist_items` + notifica broadcast |
| `endsAt <= now` | **cleanup**: cancella i file di quell'edizione, poi le righe `tracks` e la playlist |

Se un file non può essere cancellato: log + skip dell'edizione + exit code 1
→ il giro successivo ritenta. I file **prima** del DB (altrimenti un file
rimasto verrebbe re-inserito dallo scanner come track orfano).

## STEP 5 — Il ritmo settimanale

| Quando | Cosa fai |
|---|---|
| Preparazione (qualche giorno prima) | carichi i MP3 in `private/audio/pirate-day/` e lanci **Run JS Script** → `scripts/pirate-day-init.js` |
| Subito dopo | apri `manifest.json` dal File Manager e cambia **solo il curatore** (descrizione e data le fa il generatore) |
| Il giorno dell'edizione | il cron orario pubblica da solo (nessun intervento) |
| Dopo 24h | il cron orario ripulisce: file cancellati, edizione rimossa dal DB |
| La settimana dopo | ripeti da capo: il generatore calcola edizione e data successive |

Il giorno e l'ora stanno **solo** nel manifest: per spostarli si modifica il
manifest (o si rilancia il generatore) e il tick successivo fa il resto —
nessun passaggio in cPanel.

## Verifica rapida

```bash
cd chaos-web-player/backend
npm run pirate-day          # pubblica (o pulisce) e stampa il log
tail -50 logs/pirate-day.log
```

Dopo la pubblicazione, in produzione:
- `GET /api/playlists/pirate-day` → 200 con `title`, `curator`, `items[]`, `endsAt`
- `GET /api/playlists/show-list` → **non** contiene i brani del pirate day
- `POST /api/favorites/<id brano pirate day>` → **403 forbidden**

---

# Troubleshooting

### Deploy fallisce in `.cpanel.yml`

cPanel mostra i log dell'ultimo deploy. Cerca "Error". Cause comuni:
- `npm install` fallisce: forse serve `NODE_ENV=development` o manca una dep
- `npx prisma migrate deploy` fallisce: connessione DB o permessi
- Path sbagliato: usa sempre `$DEPLOY_ROOT/chaos-web-player/...`

### Backend non si avvia dopo restart

cPanel → Setup Node.js App → "Open Logs" → cerca errori TypeScript/import.

### `/api/*` ritorna 404

`.htaccess` non sta facendo il proxy. Verifica che `mod_proxy` sia attivo (chiedi supporto Namecheap).

### Cookie non persiste

Verifica in DevTools → Application → Cookies che `token` abbia flag `Secure` (richiesto in HTTPS). Verifica in `src/index.js` CORS allowlist includa `https://radio.chaosroom.online`.

### Build frontend fallisce per memoria

Il frontend **non** viene più costruito sul server (il `dist` è committato): il problema si presenta in **locale**, su Windows, quando `npm run build` esce con OOM. Limita la memoria di Node:

```powershell
# PowerShell
$env:NODE_OPTIONS="--max-old-space-size=4096"
npm run build
```

Su Stellar il limite non si presenta: la pipeline non esegue la build.

---

## Troubleshooting post-deploy reale (lesson learned)

Queste sono le 3 trappole che ho incontrato deployando per la prima volta. Sono tutte risolte e documentate per evitare di rifarle.

### 1. Errore `Cannot find package 'dotenv'` persiste dopo `npm install`

**Sintomo**: lo `stderr.log` mostra `Cannot find package 'dotenv' imported from ...src/index.js` anche dopo `Run NPM Install` nel pannello cPanel.

**Causa**: cPanel Application Manager usa `npm install --production` di default, che salta le `devDependencies`. Anche dopo aver spostato `dotenv` in `dependencies`, la cache di Passenger tiene in memoria il vecchio file JS. Restart e Stop/Start non ricaricano il file.

**Fix (workaround)**: 
1. Tieni `dotenv` in `dependencies` (non `devDependencies`)
2. NON rimuoverlo anche se il codice non lo usa più (vedi punto 2 per il fix vero)
3. Verifica che il nuovo codice sia caricato: aggiungi una riga `console.log` con marker univoco come prima riga di `src/index.js`. Dopo restart, cerca la stringa in stderr.log

**Fix vero** (richiede migrazione a host con SSH): rimuovi `dotenv` da `src/index.js` e gestisci env vars solo via pannello cPanel o process manager. Su Stellar shared non è possibile farlo in modo affidabile.

### 2. Frontend fa richieste a `http://localhost:3001/api/...` invece di `/api/...`

**Sintomo**: Console browser mostra:
```
Access to fetch at 'http://localhost:3001/api/auth/me' from origin 'https://radio.chaosroom.online' has been blocked by CORS policy
GET http://localhost:3001/api/auth/me net::ERR_FAILED
```

**Causa**: il file `chaos-web-player/frontend/.env.local` ha `VITE_API_URL=http://localhost:3001/api` (impostato per dev). Vite dà priorità a `.env.local` su `.env.production`, quindi la build di produzione ha baked-in l'URL di dev.

**Fix**:
1. Svuota `chaos-web-player/frontend/.env.local` (o commenta `VITE_API_URL`)
2. Svuota `chaos-web-player/frontend/.env.production` (anche se non c'è, crealo vuoto)
3. Rebuild **in locale**: `cd chaos-web-player/frontend && npm run build`
4. Verifica che il dist NON contenga `localhost:3001`: `grep -r "localhost:3001" chaos-web-player/frontend/dist/`
5. `git add dist/ && git commit && git push` → poi "Update from Remote" su cPanel

**Lezione**: **OGNI volta** che modifichi `.env.local`, devi ribuildare il frontend. E `.env.local` non dovrebbe MAI avere un URL assoluto di produzione (solo `localhost:*` per dev).

### 3. `stderr.log` non si aggiorna dopo restart, stesso errore vecchio

**Sintomo**: dopo Stop + Start + Run NPM Install, lo `stderr.log` mostra ancora gli stessi errori di ore fa.

**Causa**: Phusion Passenger (su cPanel Stellar) ha una **cache aggressiva** del file JS. Anche se `node_modules` viene aggiornato e il file sorgente è cambiato, Passenger non ricarica il processo Node finché non vede `tmp/restart.txt` nella **application root** (cartella del backend).

**Fix**:
1. Verifica che `.cpanel.yml` abbia `touch $SOURCE_ROOT/backend/tmp/restart.txt` alla fine
2. Verifica che la cartella `tmp/` esiste nel backend dopo il deploy
3. Se Passenger ancora non riavvia: cambia la versione Node nel pannello Setup Node.js App → forza distruzione e ricreazione del nodevenv → ricostruisce tutto

**Diagnostica rapida** per capire se il nuovo codice sta girando:
```bash
curl -s https://radio.chaosroom.online/api/debug
```
Restituisce `pid`, `node`, env vars, `cwd` e `git` (commit SHA). Se il `pid` cambia tra due restart, Passenger sta riavviando. Se vedi il marker `console.log` in stderr.log, il nuovo codice è caricato.

### 4. Il frontend è aggiornato ma il backend no (due copie del codice)

**Sintomo**: dopo un deploy, la UI mostra le novità (frontend) ma il backend continua a rispondere come prima (fix del backend mai arrivati, endpoint vecchi, regole di business obsolete).

**Causa**: `SOURCE_ROOT` in `.cpanel.yml` punta a una **copia diversa** rispetto a quella che esegue il Node.js App. La pipeline aggiorna (build frontend, `npm install`, `prisma generate`) la copia indicata da `SOURCE_ROOT`, ma Passenger avvia il processo dall'**application root** configurata nel pannello: se le due sono diverse, il backend che gira resta vecchio per sempre.

**Fix**:
1. `curl -s https://radio.chaosroom.online/api/debug` → il campo `cwd` dice **dove** gira il backend
2. Deve coincidere con `$SOURCE_ROOT/backend` in `.cpanel.yml`:
   `cwd` = `/home/<user>/radio.chaosroom.online/chaos-web-player/backend`
   ⟹ `SOURCE_ROOT=$DEPLOY_ROOT/chaos-web-player` (senza `/repo`)
3. Nel pannello Setup Node.js App, **Application root** = `radio.chaosroom.online/chaos-web-player/backend`
4. Se esiste una copia obsoleta (es. `.../repo/chaos-web-player/`), eliminarla: due copie dello stesso backend sono la causa ricorrente di "il fix non c'è"
5. Verifica col campo `git` di `/api/debug`: il SHA deve corrispondere all'ultimo commit pushato

---

---

# Alternative

## GitHub Actions (CI/CD vero)

Vedi `.github/workflows/deploy.yml` per un workflow che builda su GitHub e fa SSH deploy. Richiede SSH abilitato su Stellar (spesso non c'è su shared base). Più complesso ma più professionale.

## Deploy manuale (fallback)

Se Git Version Control dà problemi, vedi `deploy/post-deploy.sh` e fai upload manuale via FTP/File Manager dei file escludendo `node_modules`, `.env`, `generated/`.

---

# Note post-deploy

- **MP3**: copia file in `/home/tuouser/radio.chaosroom.online/chaos-web-player/backend/private/audio/`
- **Cron**: configura le due job (scanner ogni 5', Pirate Day ogni ora) → vedi **PARTE D**
- **Pirate Day**: carica i MP3 in `private/audio/pirate-day/` e genera il manifest con **Run JS Script** → `scripts/pirate-day-init.js` → vedi **PARTE D**
- **Fase 6**: polish (toast errori, ottimizzazione mobile breakpoint 375px, eventuali miglioramenti UX)
- **DNS**: se `radio.chaosroom.online` non è ancora attivo, configura il subdomain in cPanel → Domains

## File di riferimento

- `.cpanel.yml` (root del repo) — script auto-deploy
- `.github/workflows/deploy.yml` — CI/CD alternativo
- `backend/.env.example` — template env vars
- `backend/scripts/README.md` — documentazione degli script CLI (scan, pirate-day, seed, smoke test)
- `deploy/post-deploy.sh` — bootstrap script
- `deploy/.htaccess.example` — config Apache