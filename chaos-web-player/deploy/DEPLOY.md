# Chaos Radio — Deploy su Namecheap Stellar

**Data preparazione**: 2026-10-07
**Ultimo aggiornamento**: 2026-10-16 (Fase 5 completata: 5.3, 5.4, 5.5)
**Versione**: MVP completo (Fasi 0-5 completate; Fase 2 saltata, da implementare)
**Target**: subdomain `radio.chaosroom.online`

> ⚠️ **Prima di iniziare**: assicurati di avere accesso a cPanel di Namecheap Stellar con i permessi per creare DB, gestire Setup Node.js App, e usare Git Version Control.

---

## Cosa viene deployato

| Componente | Stato | Note |
|---|---|---|
| Frontend (PWA) | ✅ pronto | Build generata **on-deploy** lato server (vedi `.cpanel.yml`) |
| Backend API | ✅ pronto | Tutti gli endpoint auth/tracks/favorites/playlists/notifications |
| Auth (login/register/logout) | ✅ testato in dev | Cookie httpOnly + JWT |
| Player audio | ✅ funzionante | Ma DB vuoto: niente MP3 caricati → "Nessun brano" |
| Playlist | ✅ funzionante | Lista "SHOW LIST" vuota |
| Favorites | ✅ completo | Fetch `/api/favorites` + riuso `TrackListItem` con cuore filled |
| Notifications | ✅ completo | Fetch `/api/notifications` + optimistic mark-read |
| Pirate Day | ✅ completo | Countdown live + progress bar + curator + descrizione con highlight |
| Scan + Seed scripts | ⏸️ non implementati (Fase 2 saltata) | Da implementare quando ci saranno MP3 |

---

## Architettura finale su Stellar

```
https://radio.chaosroom.online/
├── /                  → static (Vite build, serve index.html)
├── /assets/*          → static (JS, CSS, fonts)
├── /icon-*.png        → static (PWA icons)
├── /manifest.webmanifest → static (PWA manifest)
├── /sw.js              → static (PWA service worker)
└── /api/*              → rewrite a Node.js (backend)
```

Sul server Stellar la struttura è:
```
/home/tuouser/radio.chaosroom.online/
├── .htaccess                          ← config Apache
├── chaos-web-player/                  ← repo clonato
│   ├── backend/                       ← Node.js + Express
│   ├── frontend/                      ← sorgenti Vite
│   └── .cpanel.yml                    ← script auto-deploy
├── frontend/dist/                     ← build Vite (generata da .cpanel.yml)
├── backend/private/                   ← MP3 e cover (privato)
└── tmp/                               ← restart.txt per Passenger
```

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
git push -u origin main
```

**Nota**: alla richiesta password incolla il PAT del passo 3, non la password GitHub.

Se `main` non è il branch di default (potrebbe essere `master`):
```bash
git branch -M main
git push -u origin main
```

## STEP 5 — Clona il repo in cPanel (Git Version Control)

> ⚠️ **Se il path `/home/tuouser/radio.chaosroom.online` contiene già file** (default index.html di Namecheap, .well-known, cgi-bin), usa il **path alternativo** `/home/tuouser/radio.chaosroom.online/repo`. Il `.cpanel.yml` è già configurato per questa struttura.

1. cPanel → **Files** → **Git Version Control**
2. Click **Create**
3. Compila:
   - **Clone URL**: `https://github.com/TUO-USERNAME/chaos-radio.git`
   - **Repository path**: `/home/tuouser/radio.chaosroom.online/repo` ← **con `/repo` finale**
   - **Branch**: `master`
   - **Deployment**: lascia vuoto (usa il .cpanel.yml del repo)
4. Click **Create**
5. Aspetta che il clone finisca (30-60 secondi)
6. Verifica in File Manager: `/home/tuouser/radio.chaosroom.online/repo/chaos-web-player/` deve esistere

## STEP 6 — Trigger primo deploy (esegue .cpanel.yml)

Torna in **Git Version Control** → la tua repo → click **Pull or Deploy** → **Update from Remote**

Questo esegue il `.cpanel.yml`:
- `npm install --production` in backend
- `npx prisma generate` e `npx prisma migrate deploy` (crea le 7 tabelle)
- `npm install` + `npm run build` in frontend
- Copia `frontend/dist/*` in `/home/tuouser/radio.chaosroom.online/frontend/dist/`
- Touch `tmp/restart.txt` (restart Passenger)

Tempo: 2-5 minuti. Controlla i log nel pannello per errori.

## STEP 7 — Crea `backend/.env` con credenziali produzione

cPanel → **File Manager** → `/home/tuouser/radio.chaosroom.online/repo/chaos-web-player/backend/`

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
```

> ⚠️ Il file NON verrà sovrascritto dai prossimi pull (è in `.gitignore`).

## STEP 7b — Applica migration al DB (via phpMyAdmin)

> SSH disabilitato su Stellar shared, niente terminale. Il client Prisma è già committato in `backend/generated/prisma/`, ma serve comunque applicare la migration al DB.

1. cPanel → **Databases** → **phpMyAdmin**
2. Click sulla tabella `chaouaza_chaos_radio` (o `chaos_radio` se non hai prefisso) nella sidebar sinistra
3. Click tab **Import** in alto
4. Click **Choose File** → naviga a `/home/chaouaza/radio.chaosroom.online/repo/chaos-web-player/backend/prisma/migrations/20261006105522_init/migration.sql`
5. Click **Go** in fondo alla pagina
6. Verifica che le 7 tabelle siano presenti nella sidebar: `users`, `tracks`, `favorites`, `playlists`, `playlist_items`, `notifications`, `notification_reads`

## STEP 8 — Setup Node.js App (Application Manager)

> ⚠️ **Niente terminale su Stellar shared** — SSH è disabilitato. Abbiamo rimosso `postinstall: prisma generate` e committato il client Prisma generato (`backend/generated/prisma/`) direttamente nel repo, così non serve `prisma generate`. Per la migration usiamo **phpMyAdmin** (vedi STEP 9).

1. cPanel → **Software** → **Setup Node.js App**
2. Click **Create Application**:
   - **Node.js version**: scegli **22.x** o la più recente disponibile
   - **Application mode**: Production
   - **Application root**: `radio.chaosroom.online/repo/chaos-web-player/backend` (con `/repo` percorso)
   - **Application URL**: `radio.chaosroom.online`
   - **Application startup file**: `src/index.js`
3. Click **Create**
4. Nella card dell'app, prendi nota del percorso **Virtual environment** (es. `/home/chaouaza/nodevenv/radio.chaosroom.online/22`)
5. Click **Run NPM Install** (senza `postinstall` → dovrebbe completare OK)
6. Click **Restart** per avviare

> Se Stellar offre solo Node 20 LTS: `tsx` (già in package.json) compila i `.ts` di Prisma a runtime. Funziona out-of-the-box.

## STEP 9 — Configura `.htaccess` (SPA + proxy /api)

cPanel → File Manager → `/home/tuouser/radio.chaosroom.online/`

Crea `.htaccess` (se esiste già, modifica):

```apache
RewriteEngine On

# Force HTTPS
RewriteCond %{HTTPS} !=on
RewriteRule ^(.*)$ https://%{HTTP_HOST}/$1 [R=301,L]

# Proxy /api/* → Node backend (porta interna 3001)
RewriteCond %{REQUEST_URI} ^/api/
RewriteRule ^api/(.*)$ http://127.0.0.1:3001/api/$1 [P,L]

# SPA fallback: per qualsiasi path non-file, serve index.html
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^.*$ /frontend/dist/index.html [L]

# Cache assets statici (hash nei nomi file)
<FilesMatch "\.(js|css|png|svg|woff2|ico|webmanifest)$">
  Header set Cache-Control "public, max-age=31536000, immutable"
</FilesMatch>

# No cache per index.html, sw.js
<FilesMatch "^(index\.html|sw\.js|registerSW\.js|workbox-.*\.js)$">
  Header set Cache-Control "no-cache, must-revalidate"
</FilesMatch>

# Security headers
Header always set X-Content-Type-Options "nosniff"
Header always set X-Frame-Options "DENY"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
Header always set Service-Worker-Allowed-Origin "/"

Options -Indexes
```

---

# PARTE B — Workflow di update

## Update del codice (dopo modifiche locali)

```bash
cd "C:\Users\GGsabani\Desktop\chaos web player"

# Verifica cosa è cambiato
git status

# Commit
git add .
git commit -m "feat: descrizione delle modifiche"

# Push
git push origin main
```

## Trigger del deploy su cPanel

1. cPanel → **Git Version Control** → la tua repo
2. Click **Pull or Deploy** → **Update from Remote**
3. Il `.cpanel.yml` ricostruisce tutto automaticamente (2-5 min)

## Update delle env vars (es. nuovo JWT_SECRET)

1. cPanel → File Manager → `/home/tuouser/radio.chaosroom.online/chaos-web-player/backend/.env`
2. Modifica con Editor
3. Setup Node.js App → Restart

## Update solo del backend (no rebuild frontend)

Salta il `npm run build` in `.cpanel.yml` rimuovendo temporaneamente le righe frontend. Oppure fai le modifiche e trigger il deploy completo (ricostruisce anche il frontend, ci mette 1-2 min in più).

---

# PARTE C — Verifica

Apri `https://radio.chaosroom.online`:

- [ ] Pagina mostra logo Chaos Radio + form login
- [ ] SSL valido (lucchetto verde)
- [ ] Clicca "Registrati" → form registrazione funziona
- [ ] Dopo registrazione → redirect a `/player`
- [ ] Player mostra "Nessun brano" (DB vuoto)
- [ ] BottomNav: clicca su Playlist → "SHOW LIST" vuoto
- [ ] Favorites → empty state "Nessun preferito" (tocca cuore su brano per aggiungere)
- [ ] Notifications → empty state "Nessuna notifica"
- [ ] Pirate Day → empty state "Nessuna playlist attiva" (finché non viene creata)
- [ ] Logout → redirect a `/login`

Test API:
```bash
curl https://radio.chaosroom.online/api/health
# → {"status":"ok",...}

curl -X POST https://radio.chaosroom.online/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'
```

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

Stellar ha limiti RAM. Se `npm run build` esce con OOM, prova a limitare i worker:
```yaml
    - cd $DEPLOY_ROOT/chaos-web-player/frontend
    - NODE_OPTIONS=--max-old-space-size=512 npm run build
```

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
3. Rebuild il frontend: `cd chaos-web-player/frontend && npm run build`
4. Verifica che il dist NON contenga `localhost:3001`: `grep -r "localhost:3001" chaos-web-player/frontend/dist/`
5. Commit + push + pull su cPanel

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
Restituisce `pid`, `node`, env vars. Se il `pid` cambia tra due restart, Passenger sta riavviando. Se vedi il marker `console.log` in stderr.log, il nuovo codice è caricato.

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
- **Fase 2**: implementa `scripts/scan.js` e aggiungi cron in cPanel (oppure inserisci record `tracks` manualmente via phpMyAdmin)
- **Fase 6**: polish (toast errori, ottimizzazione mobile breakpoint 375px, eventuali miglioramenti UX)
- **DNS**: se `radio.chaosroom.online` non è ancora attivo, configura il subdomain in cPanel → Domains

## File di riferimento

- `.cpanel.yml` (root del repo) — script auto-deploy
- `.github/workflows/deploy.yml` — CI/CD alternativo
- `backend/.env.example` — template env vars
- `deploy/post-deploy.sh` — bootstrap script
- `deploy/.htaccess.example` — config Apache