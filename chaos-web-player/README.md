# Chaos Radio — Root

Monorepo del web player Chaos Radio, **live su [radio.chaosroom.online](https://radio.chaosroom.online)** (Namecheap Stellar).

## Struttura

```
chaos-web-player/
├── backend/        # Node + Express + Prisma (MySQL)
├── frontend/       # Vite + React + TypeScript (build statico committato)
├── deploy/         # .cpanel.yml + .htaccess.example + DEPLOY.md
└── plans/          # piani di implementazione e changelog
```

## Stack

- **Frontend**: Vite 8 + React 19 + TypeScript + Tailwind v3 (pinned) + Zustand + React Router v7
- **Backend**: Node 22 (cPanel Stellar) + Express 5 + **Prisma 7** con `@prisma/adapter-mariadb` + `mariadb` driver + MySQL 8 + JWT + bcrypt
- **Runtime TS**: `tsx` 4.x (esegue i `.ts` del client Prisma generato)
- **Deploy**: Namecheap Stellar (cPanel Application Manager + Git Version Control), subdomain `radio.chaosroom.online`, HTTPS via AutoSSL

## Stato del progetto

| Fase | Stato | Note |
|---|---|---|
| 0 — Setup locale | ✅ | WSL Ubuntu + MySQL locale + portproxy Windows |
| 1 — Backend foundation | ✅ | 11 endpoint REST auth-protected |
| 2 — Backend scripts (scan/seed) | ⏭️ saltata | Upload manuale via File Manager + phpMyAdmin |
| 3 — Frontend setup | ✅ | PWA + manifest + icone |
| 4 — Routing & Auth flow | ✅ | 9 route, ProtectedRoute, hydrate-on-mount |
| 5.1 — Player | ✅ | Audio reale, waveform, controls, Media Session |
| 5.2 — Playlist | ✅ | "SHOW LIST" con riuso TrackListItem |
| 5.3 — Favorites | ✅ | "USER FAVORITES" con riuso TrackListItem + useFavoritesStore |
| 5.4 — Notifications | ✅ | "UPDATES" con optimistic mark-read via useNotificationsStore |
| 5.5 — Pirate Day | ✅ | Countdown live + progress bar + curator + descrizione con **highlight** |
| 6 — PWA & polish | 🟡 parziale | PWA OK + Media Session, polish (toast, errori) da completare |
| 7 — Deploy | ✅ | **Live su radio.chaosroom.online** |

## Quickstart (sviluppo locale Windows + WSL)

L'ambiente di sviluppo richiede **WSL Ubuntu** perché il backend Node gira in WSL con `tsx` (per il client Prisma TypeScript) e si connette a **MySQL installato in WSL**.

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
# Backend (in WSL, con tsx che esegue .ts di Prisma)
wsl -u root bash -c "cd /mnt/c/.../chaos-web-player/backend && \
  DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=chaos_app DB_PASSWORD=devpass DB_NAME=chaos_radio \
  JWT_SECRET=... npx tsx src/index.js"

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
2. cPanel → Git Version Control → clone del repo in `/home/tuouser/radio.chaosroom.online/chaos-web-player/`
3. cPanel → Setup Node.js App → Node 22 → Application root: `chaos-web-player/backend` → startup: `src/index.js`
4. Setup Environment Variables (8 vars nel pannello, vedi sotto)
5. Setup Node.js App → Run NPM Install (`.cpanel.yml` esegue automaticamente + `touch tmp/restart.txt` per restart Passenger)
6. Applica migration via **phpMyAdmin Import** del file `prisma/migrations/<timestamp>_init/migration.sql`
7. Restart Node app → test `https://radio.chaosroom.online/api/health`

### Env vars (impostate nel pannello cPanel, NON in un file `.env`)

| Nome | Valore |
|---|---|
| `DB_HOST` | `localhost` |
| `DB_PORT` | `3306` |
| `DB_USER` | `chaouaza_chaos_app` (con prefisso username cPanel) |
| `DB_PASSWORD` | [password generata in STEP 1] |
| `DB_NAME` | `chaouaza_chaos_radio` (con prefisso) |
| `JWT_SECRET` | [64 byte hex random] |
| `PORT` | `3001` |
| `NODE_ENV` | `production` |

## Caricare brani

Il backend è deployato ma il DB è vuoto. Per aggiungere brani:

1. **Upload MP3** via File Manager in `/home/chaouaza/radio.chaosroom.online/chaos-web-player/backend/private/audio/`
2. **Insert record** via phpMyAdmin nella tabella `tracks`:
   - `title` = Nome brano
   - `artist` = Artista
   - `file_path` = `/home/chaouaza/radio.chaosroom.online/chaos-web-player/backend/private/audio/nome.mp3`
   - `cover_path` = NULL (o path alla cover JPG in `private/covers/`)
3. I brani appaiono automaticamente in `/api/tracks` e quindi nel Player/Playlist

Le cover sono opzionali ma supportate: upload in `private/covers/`, imposta `cover_path` nel record.

## Trappole note (le "lesson learned" del deploy)

Queste sono state tutte risolte e documentate per evitare di rifare gli stessi errori:

1. **Prisma 7 WASM binary non si scarica su Stellar shared**: il `prisma generate` durante `npm install` fallisce perché Stellar blocca il download dei binari WASM. Fix: rimosso `postinstall: prisma generate`, committato `generated/prisma/` direttamente nel repo. La build iniziale (sul laptop dev) genera il client, poi viene committato.

2. **Passenger cache + `dotenv`**: cPanel Application Manager cachia il vecchio file JS in memoria anche dopo Stop/Start. L'errore `Cannot find package 'dotenv'` persisteva finché non si è aggiunto `dotenv` di nuovo a `dependencies` (workaround). Lezione: **MAI usare `import "dotenv/config"` su cPanel shared**. Le env vars vanno solo nel pannello Environment Variables.

3. **`VITE_API_URL` hardcoded in build**: `.env.local` (dev) ha priorità su `.env.production` in Vite. Se `.env.local` ha `http://localhost:3001/api`, la build di produzione punterà a localhost → 404. Fix: `.env.local` vuoto (commentato), `.env.production` vuoto → build usa default `/api` (relativo). **Ogni volta che modifichi `.env.local`, rebuilda il frontend.**

4. **Dopo `git push`, aspettare 30+ secondi prima di testare** (cPanel Passenger ha cache aggressiva). Usa `curl -s https://radio.chaosroom.online/api/debug` per verificare che il nuovo codice sia in esecuzione.

5. **`.cpanel.yml` viene eseguito automaticamente da cPanel Git Version Control** al pull. Crea le cartelle `private/`, installa deps, e fa `touch tmp/restart.txt` per restart Passenger.

## Script utili

| Path       | Script       | Azione |
|------------|--------------|--------|
| `backend/` | `npm run dev` | `tsx` su 3001 (WSL, dev) |
| `backend/` | `npm start` | `tsx src/index.js` in produzione (Node 20+ e 22+) |
| `backend/` | `npm run prisma:studio` | GUI Prisma per ispezionare il DB |
| `frontend/`| `npm run dev` | Vite dev server su 5173 (proxy `/api` a :3001) |
| `frontend/`| `npm run build` | build produzione in `dist/` (committato) |
| `frontend/`| `node scripts/generate-icons.mjs` | rigenera PWA icons da icon.svg |

## Note operative

- **Dopo un riavvio di WSL**, l'IP cambia. Ri-eseguire il blocco `netsh portproxy` con il nuovo IP.
- **Lo script di avvio backend con `tsx`** funziona sia su Node 20 LTS (Stellar prod) che su Node 22 (WSL dev). Esegue i `.ts` del client Prisma senza bisogno di flag.
- **Tutti i secrets in `.env` (dev locale) sono in `.gitignore`.** In produzione le env vars sono solo nel pannello cPanel.
- **Il DB di sviluppo (WSL) ha `caching_sha2_password` sostituito con `mysql_native_password`** per compatibilità con il driver MariaDB.
- **`dotenv` resta in `dependencies` del backend** (workaround Passenger cache) finché non si migra a un host con SSH/container (es. Render, Fly.io).

## Riferimenti

- Piano dettagliato: [`plans/chaos-radio-player.md`](./plans/chaos-radio-player.md)
- README backend: [`backend/README.md`](./backend/README.md)
- Guida deploy: [`deploy/DEPLOY.md`](./deploy/DEPLOY.md)
- Live: [https://radio.chaosroom.online](https://radio.chaosroom.online)
