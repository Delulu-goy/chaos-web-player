# Chaos Radio — Root

Monorepo del web player Chaos Radio, deployato su `radio.chaosroom.online` (Namecheap Stellar).

## Struttura

```
chaos-web-player/
├── backend/        # Node + Express + Prisma (MySQL)
├── docs/            # (futuro) — contratti API e decision log
└── plans/          # piani di implementazione
```

## Stack

- **Frontend**: Vite + React 19 + TypeScript + Tailwind v3 (pinned) + Zustand + React Router v7
- **Backend**: Node 22 (WSL dev) / Node 20 LTS (Stellar prod) + Express 5 + **Prisma 7** con **`@prisma/adapter-mariadb`** + MySQL 8 + JWT + bcrypt
- **Deploy**: Namecheap Stellar (cPanel Application Manager), subdomain `radio.chaosroom.online`

## Quickstart (sviluppo locale Windows + WSL)

L'ambiente di sviluppo richiede **WSL Ubuntu** perché il backend Node gira in WSL (con `--experimental-strip-types` per Prisma 7) e si connette a **MySQL installato in WSL**. Da Windows si accede al backend via `netsh portproxy`.

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

# Node 22 (per --experimental-strip-types richiesto da Prisma 7)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash
DEBIAN_FRONTEND=noninteractive apt install -y nodejs
```

### Setup progetto

```bash
# Backend
cd chaos-web-player/backend
npm install
npm install @prisma/adapter-mariadb mariadb
cp .env.example .env
# Modifica .env: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET

# Migration (eseguire in WSL per lo strip-types)
wsl -u root bash -c "cd /mnt/c/.../chaos-web-player/backend && \
  DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=chaos_app DB_PASSWORD=devpass DB_NAME=chaos_radio \
  JWT_SECRET=... npx prisma migrate dev --name init"

# Frontend
cd ../frontend
npm install
npm install react-router-dom zustand lucide-react clsx
npm install -D tailwindcss@^3.4.17 postcss autoprefixer vite-plugin-pwa
npx tailwindcss init -p
```

### Avvio dev

```bash
# Backend (in WSL — daemon in background)
wsl -u root bash -c "cd /mnt/c/.../chaos-web-player/backend && \
  DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=chaos_app DB_PASSWORD=devpass DB_NAME=chaos_radio \
  JWT_SECRET=... node --experimental-strip-types src/index.js"

# Frontend (da Windows)
cd chaos-web-player/frontend
npm run dev
```

### Test rapido

```bash
curl http://localhost:3001/api/health
# → {"status":"ok","timestamp":"..."}
```

## Script utili

| Path       | Script       | Azione |
|------------|--------------|--------|
| `backend/` | `npm run dev` | nodemon Express su 3001 (richiede strip-types manuale in WSL) |
| `backend/` | `npm run scan` | scansiona cartella MP3, aggiorna DB |
| `backend/` | `npm run seed` | popola DB con dati demo |
| `backend/` | `npm run prisma:studio` | GUI Prisma per DB |
| `frontend/`| `npm run dev` | Vite dev server su 5173 |
| `frontend/`| `npm run build` | build produzione in `dist/` |

## Note operative

- Dopo un **riavvio di WSL**, l'IP cambia. Ri-eseguire il blocco `netsh portproxy` con il nuovo IP.
- Lo script di avvio backend come daemon sopravvive alla bash shell:
  ```bash
  setsid bash -c 'cd /path && node --experimental-strip-types src/index.js > /root/backend.log 2>&1 < /dev/null' < /dev/null > /dev/null 2>&1 &
  ```
- Tutti i secrets in `.env` sono in `.gitignore`.

## Riferimenti

- Piano dettagliato: [`plans/chaos-radio-player.md`](./plans/chaos-radio-player.md)
- README backend: [`backend/README.md`](./backend/README.md)