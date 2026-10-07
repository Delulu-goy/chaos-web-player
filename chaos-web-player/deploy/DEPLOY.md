# Chaos Radio — Deploy su Namecheap Stellar

**Data preparazione**: 2026-10-07
**Versione**: MVP iniziale (Fase 0-4, 5.1, 5.2 completate; 5.3-5.5 differite; Fase 2 saltata)
**Target**: subdomain `radio.chaosroom.online`

> ⚠️ **Prima di iniziare**: assicurati di avere accesso a cPanel di Namecheap Stellar con i permessi per creare DB, gestire Setup Node.js App, e modificare i file nel document root.

---

## Cosa viene deployato

| Componente | Stato | Note |
|---|---|---|
| Frontend (PWA) | ✅ pronto | Build in `chaos-web-player/frontend/dist/` (291 KB JS, 9.5 KB CSS) |
| Backend API | ✅ pronto | Tutti gli endpoint auth/tracks/favorites/playlists/notifications |
| Auth (login/register/logout) | ✅ testato in dev | Cookie httpOnly + JWT |
| Player audio | ✅ funzionante | Ma DB vuoto: niente MP3 caricati → "Nessun brano" |
| Playlist | ✅ funzionante | Lista "SHOW LIST" vuota |
| Favorites | ⏸️ stub | Solo titolo, nessun preferito visibile |
| Notifications | ⏸️ stub | Solo titolo, nessuna notifica |
| Pirate Day | ⏸️ stub | Solo titolo, nessun contenuto |
| Scan + Seed scripts | ⏸️ non implementati (Fase 2 saltata) | Admin deve caricare MP3 via FTP/cPanel File Manager e scrivere script in seguito |

---

## Architettura finale su Stellar

```
https://radio.chaosroom.online/
├── /                  → static (Vite build, serve index.html)
├── /assets/*          → static (JS, CSS, fonts)
├── /icon-*.png        → static (PWA icons)
├── /manifest.webmanifest → static (PWA manifest)
├── /sw.js              → static (PWA service worker)
├── /api/*              → rewrite a Node.js (backend)
└── /uploads/* (futuro) → static (cover caricate)
```

---

## STEP 1 — Crea database MySQL (cPanel)

1. Login cPanel: `https://chaosroom.online:2083` (o vai da Namecheap dashboard)
2. Sezione **Databases** → **MySQL® Databases**
3. **Create New Database**:
   - Database name: `chaos_radio` (diventerà `tuouser_chaos_radio`)
   - Click **Create Database**
4. **Create New User** (sotto):
   - Username: `chaos_app` (diventerà `tuouser_chaos_app`)
   - Password: usa **Password Generator**, copia la password
   - Click **Create User**
5. **Add User to Database**:
   - User: `chaos_app`
   - Database: `chaos_radio`
   - Click **Add**
   - Seleziona **ALL PRIVILEGES** → **Make Changes**
6. **Remote MySQL Access** (sezione Databases): aggiungi `%` come host per consentire connessioni da Node.js (oppure usa `localhost` se il backend gira sulla stessa macchina)

**Annotati per dopo**:
- Hostname MySQL: `localhost` (default se Node gira su Stellar)
- Database completo: `tuouser_chaos_radio` (cPanel prepende il tuo username)
- User completo: `tuouser_chaos_app`
- Password: [quella generata]

---

## STEP 2 — Carica i file del backend

1. cPanel → **File Manager**
2. Naviga a `/home/tuouser/radio.chaosroom.online/` (creala se non esiste)
3. Crea sottocartelle:
   - `backend/`
   - `backend/private/` (per MP3 e cover, protetto)
   - `frontend/` (per la build Vite)
4. **Carica il backend** nella cartella `backend/`:
   - Da `chaos-web-player/backend/` carica TUTTO tranne `node_modules/`, `.env`, `generated/`
   - In cPanel usa **Upload** in File Manager (zip + estrai, oppure upload singolo)

File da caricare (struttura):
```
backend/
├── prisma/
│   ├── schema.prisma
│   └── migrations/20261006105522_init/
├── prisma7.config.ts
├── src/
│   ├── index.js
│   ├── db.js
│   ├── lib/
│   ├── middleware/
│   └── routes/
├── package.json
└── package-lock.json
```

5. **Crea `backend/.env`** con questo contenuto (clicca "+ File"):

```env
# MySQL production (sostituisci tuouser e password)
DB_HOST=localhost
DB_PORT=3306
DB_USER=tuouser_chaos_app
DB_PASSWORD=LA_PASSWORD_GENERATA
DB_NAME=tuouser_chaos_radio

# JWT — genera una nuova random 64 bytes hex per produzione
# Comando: openssl rand -hex 64
JWT_SECRET=INSERISCI_QUI_UNA_STRINGA_CASUALE_DI_64_BYTES_HEX

PORT=3001
NODE_ENV=production
```

⚠️ **NON committare questo file** (è in .gitignore)

6. **Crea cartelle private** (per futuri MP3):
   - `backend/private/audio/`
   - `backend/private/covers/`

---

## STEP 3 — Setup Node.js Application

1. cPanel → **Software** → **Setup Node.js App**
2. Click **Create Application**:
   - **Node.js version**: scegli **22.x** o la più recente disponibile (richiesto per `--experimental-strip-types` se usi Node diretto, NON richiesto se usi `tsx`)
   - **Application mode**: Production
   - **Application root**: `radio.chaosroom.online/backend`
   - **Application URL**: `radio.chaosroom.online`
   - **Application startup file**: `src/index.js`
   - **Application entry point**: lascia vuoto (usa quello di default)
3. Click **Create**
4. Una volta creata, vedrai la card dell'app con:
   - **Virtual environment** path (es. `/home/tuouser/nodevenv/radio.chaosroom.online/22`)
   - **Run script** (es. `node src/index.js`)
5. Click **Run NPM Install** (oppure esegui `npm install` via terminale SSH se hai accesso)
6. Aspetta che finisca (1-3 minuti)
7. Click **Restart** per avviare il backend

> **Se Stellar offre solo Node 20 LTS**: il progetto usa `tsx` come runtime, compatibile con Node 18+. Lo script `start` in `package.json` è già `tsx src/index.js`, quindi funziona.

---

## STEP 4 — Applica le migration al DB

Hai 2 opzioni:

### Opzione A — Via SSH (se hai accesso)

```bash
cd /home/tuouser/radio.chaosroom.online/backend
# Carica .env
source .env
# (oppure esporta le singole variabili)

npx prisma migrate deploy
```

### Opzione B — Via Setup Node.js App (senza SSH)

Dopo che il backend è avviato, apri in cPanel → **Setup Node.js App** → la tua app → **Run Script**. Esegui:
```
npx prisma migrate deploy
```

Questo crea le 7 tabelle in `chaos_radio`. Verifica con **phpMyAdmin** (sezione Databases) che siano presenti: `users`, `tracks`, `favorites`, `playlists`, `playlist_items`, `notifications`, `notification_reads`.

---

## STEP 5 — Deploy del frontend

1. **Build locale** (già fatta in `chaos-web-player/frontend/dist/`)
2. **Carica il contenuto di `dist/`** in `radio.chaosroom.online/frontend/dist/` via File Manager

⚠️ **Importante**: carica i **file dentro `dist/`** (index.html, assets/, sw.js, manifest, icons), NON la cartella `dist/` stessa.

---

## STEP 6 — Configura `.htaccess` per servire frontend + API

1. cPanel → File Manager → `/home/tuouser/radio.chaosroom.online/`
2. Crea/modifica `.htaccess` (se non esiste, "+ File")
3. Contenuto:

```apache
# Chaos Radio — Apache config
# Serve il frontend statico + fa il proxy di /api/* al backend Node.js

# Abilita rewrite engine
RewriteEngine On

# Forza HTTPS
RewriteCond %{HTTPS} !=on
RewriteRule ^(.*)$ https://%{HTTP_HOST}/$1 [R=301,L]

# Se la richiesta è per /api/* → passa al Node backend (porta interna)
RewriteCond %{REQUEST_URI} ^/api/
RewriteRule ^api/(.*)$ http://127.0.0.1:3001/api/$1 [P,L]

# Per tutto il resto: serve index.html (SPA fallback)
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^.*$ /frontend/dist/index.html [L]

# Cache assets statici per 1 anno
<FilesMatch "\.(js|css|png|svg|woff2|ico)$">
  Header set Cache-Control "public, max-age=31536000, immutable"
</FilesMatch>

# Sicurezza
Header always set X-Content-Type-Options "nosniff"
Header always set X-Frame-Options "DENY"
Header always set Referrer-Policy "strict-origin-when-cross-origin"

# Disabilita directory listing
Options -Indexes
```

> **Se il proxy interno non funziona**: prova a mettere `localhost:3001` o l'IP interno che ti fornisce Namecheap. In alternativa, configura il Setup Node.js App per ascoltare direttamente sulla porta pubblica (non ideale per sicurezza ma funzionante).

---

## STEP 7 — Verifica

Apri `https://radio.chaosroom.online` nel browser. Dovresti vedere:

- [ ] La pagina mostra il logo Chaos Radio + form di login
- [ ] SSL valido (lucchetto verde, https)
- [ ] Clicca "Registrati" → form di registrazione funziona
- [ ] Dopo registrazione → redirect a `/player`
- [ ] Pagina player mostra messaggio "Nessun brano" (DB vuoto)
- [ ] Naviga su Playlist (BottomNav) → "SHOW LIST" vuoto
- [ ] Favorites, Notifications, Pirate Day → solo titolo (stub)
- [ ] Logout → torna a /login

### Test API diretto

```bash
# Da terminale locale con curl
curl https://radio.chaosroom.online/api/health
# → {"status":"ok","timestamp":"..."}

# Register
curl -X POST https://radio.chaosroom.online/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123","displayName":"Test"}'

# Login + cookie
curl -X POST https://radio.chaosroom.online/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"test@example.com","password":"testpass123"}'

# /me con cookie
curl -b cookies.txt https://radio.chaosroom.online/api/auth/me
```

---

## Troubleshooting

### Backend non si avvia
- Controlla i log: cPanel → Setup Node.js App → "Open Logs"
- Verifica che `npm install` sia completato
- Verifica che `.env` esista e abbia tutte le variabili

### Frontend non carica
- Apri DevTools → Console per errori
- Verifica che `.htaccess` sia nella root (`/home/tuouser/radio.chaosroom.online/.htaccess`)
- Verifica che i file siano in `/frontend/dist/` (NON `dist/` direttamente)

### /api/* ritorna 404
- `.htaccess` non sta facendo il proxy
- Verifica sintassi Apache (chiedi al supporto Namecheap se serve `mod_proxy`)

### Cookie non persiste
- Verifica che il backend invii `Set-Cookie` con flag `Secure` (richiesto in HTTPS)
- Verifica CORS allowlist (in `src/index.js` è hardcoded per `radio.chaosroom.online`)

---

## Note operative post-deploy

- **Dopo riavvio WSL/cPanel Node restart**: la prima richiesta può avere 1s di cold start
- **Logs**: cPanel → Setup Node.js App → Open Logs
- **Update**: modifica il codice localmente, rebuild, upload via FTP/Git, restart Node app
- **DB backup**: cPanel → Backup Wizard (backup giornaliero di MySQL incluso)

---

## Cosa fare dopo

1. **Caricare MP3**: copia MP3 in `/home/tuouser/radio.chaosroom.online/backend/private/audio/`
2. **Implementare script di scansione** (Fase 2 — script/scan.js + cron)
3. **Completare le 3 pagine stub** (Fase 5.3, 5.4, 5.5)
4. **Configurare DNS** se `radio.chaosroom.online` non è ancora un subdomain attivo
