# Chaos Radio — Root

Monorepo del web player Chaos Radio, deployato su `radio.chaosroom.online` (Namecheap Stellar).

## Struttura

```
chaos-web-player/
├── backend/        # Node + Express + Prisma (MySQL)
├── frontend/       # Vite + React + TypeScript
├── deploy/         # File pronti per upload su Stellar + DEPLOY.md
└── plans/          # piani di implementazione
```

## Stack

- **Frontend**: Vite 8 + React 19 + TypeScript + Tailwind v3 (pinned) + Zustand + React Router v7
- **Backend**: Node 22 (WSL dev) / Node 20+ con `tsx` (Stellar prod) + Express 5 + **Prisma 7** con **`@prisma/adapter-mariadb`** + MySQL 8 + JWT + bcrypt
- **Deploy**: Namecheap Stellar (cPanel Application Manager), subdomain `radio.chaosroom.online`

## Stato del progetto

| Fase | Stato | Note |
|---|---|---|
| 0 — Setup locale | ✅ | Tutto funzionante |
| 1 — Backend foundation | ✅ | 11 endpoint REST auth-protected |
| 2 — Backend scripts (scan/seed) | ⏭️ saltata | Da implementare quando ci saranno MP3 |
| 3 — Frontend setup | ✅ | PWA + manifest + icone |
| 4 — Routing & Auth flow | ✅ | 9 route, ProtectedRoute, hydrate-on-mount |
| 5.1 — Player | ✅ | Audio reale, waveform, controls |
| 5.2 — Playlist | ✅ | "SHOW LIST" con riuso TrackListItem |
| 5.3 — Favorites | ⏸️ stub | Solo titolo |
| 5.4 — Notifications | ⏸️ stub | Solo titolo |
| 5.5 — Pirate Day | ⏸️ stub | Solo titolo |
| 6 — PWA & polish | ✅ parziale | PWA OK, Media Session OK, polish da completare |
| 7 — Deploy | 🟡 in corso | Prima release su Stellar |

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

## Deploy su produzione

Vedi **[`deploy/DEPLOY.md`](./deploy/DEPLOY.md)** per la guida completa passo-passo.

In sintesi:
1. cPanel → MySQL® Databases → crea `chaos_radio` + user `chaos_app`
2. Upload backend (escluso `node_modules/`, `.env`, `generated/`) in `/home/tuouser/radio.chaosroom.online/backend/`
3. Crea `backend/.env` con credenziali di produzione
4. Setup Node.js App → scegli Node 22+ (o 20+ con `tsx` che è già nello script)
5. `npm install` (Application Manager)
6. `npx prisma migrate deploy` (applica migration)
7. Upload del contenuto di `frontend/dist/` in `/home/tuouser/radio.chaosroom.online/frontend/dist/`
8. Copia `.htaccess` (in `deploy/.htaccess.example`) nella root
9. Restart Node app, testa `https://radio.chaosroom.online`

## Script utili

| Path       | Script       | Azione |
|------------|--------------|--------|
| `backend/` | `npm run dev` | nodemon + tsx su 3001 (WSL) |
| `backend/` | `npm start` | tsx in produzione (compatibile Node 20+ e 22+) |
| `backend/` | `npm run prisma:studio` | GUI Prisma per ispezionare il DB |
| `frontend/`| `npm run dev` | Vite dev server su 5173 |
| `frontend/`| `npm run build` | build produzione in `dist/` |
| `frontend/`| `node scripts/generate-icons.mjs` | rigenera PWA icons |

## Note operative

- Dopo un **riavvio di WSL**, l'IP cambia. Ri-eseguire il blocco `netsh portproxy` con il nuovo IP.
- Lo script di avvio backend con `tsx` sopravvive alla bash shell e funziona su Node 20 LTS (Stellar) senza bisogno di `--experimental-strip-types`.
- Tutti i secrets in `.env` sono in `.gitignore`.
- Il DB di sviluppo (WSL) ha `caching_sha2_password` sostituito con `mysql_native_password` per compatibilità con il driver MariaDB.

## Riferimenti

- Piano dettagliato: [`plans/chaos-radio-player.md`](./plans/chaos-radio-player.md)
- README backend: [`backend/README.md`](./backend/README.md)
- Guida deploy: [`deploy/DEPLOY.md`](./deploy/DEPLOY.md)