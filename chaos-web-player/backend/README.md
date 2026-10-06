# Chaos Radio backend — README sviluppatore

Backend Express + Prisma per il web player Chaos Radio.

## Stack

- **Node.js 22 in WSL dev** (richiesto per `--experimental-strip-types` di Prisma 7), **Node 20 LTS target in produzione** (Stellar)
- Express 5
- Prisma 7.10 con `@prisma/adapter-mariadb` + driver `mariadb` (MariaDB è compatibile con MySQL 8)
- MySQL 8 (via WSL in dev, via cPanel in prod)
- JWT in cookie httpOnly, bcrypt per le password

## Quickstart (dev locale)

### Prerequisiti

- **WSL 2** con Ubuntu 24.04 (o distro simile con systemd attivo)
- **MySQL 8** installato in WSL con `bind-address = 0.0.0.0` e utente `chaos_app` con `mysql_native_password` + `ALL PRIVILEGES ON *.* WITH GRANT OPTION`
- **Node.js 22** in WSL (da NodeSource `setup_22.x`)
- **Portproxy Windows → WSL**: 127.0.0.1:3001 → WSL_IP:3001 (eseguito come amministratore)

### Setup

```bash
# 1. Dipendenze
npm install
npm install @prisma/adapter-mariadb mariadb

# 2. Configurazione env
cp .env.example .env
# Modifica .env con i valori del tuo ambiente dev:
#   DB_HOST=127.0.0.1
#   DB_PORT=3306
#   DB_USER=chaos_app
#   DB_PASSWORD=devpass
#   DB_NAME=chaos_radio
#   JWT_SECRET=<random 64 bytes hex>
#   PORT=3001
#   NODE_ENV=development

# 3. Migration (eseguire in WSL per strip-types)
wsl -u root bash -c "cd /mnt/c/.../chaos-web-player/backend && \
  DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=chaos_app DB_PASSWORD=devpass DB_NAME=chaos_radio \
  JWT_SECRET=... npx prisma migrate dev --name init"

# 4. Avvio backend (da WSL)
wsl -u root bash -c "cd /mnt/c/.../chaos-web-player/backend && \
  DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=chaos_app DB_PASSWORD=devpass DB_NAME=chaos_radio \
  JWT_SECRET=... node --experimental-strip-types src/index.js"
```

Server in ascolto su `http://localhost:3001` (via portproxy Windows → WSL). Health check: `GET /api/health`.

### Setup MySQL da zero (riferimento rapido)

```bash
# In WSL Ubuntu
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

### Setup portproxy Windows (riferimento rapido)

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
| `npm run dev` | nodemon su `src/index.js` (in dev va lanciato in WSL + con strip-types) |
| `npm start` | node `src/index.js` (prod) |
| `npm run scan` | scansiona cartella MP3 (vedi `scripts/scan.js`) |
| `npm run seed` | popola DB con dati demo |
| `npm run prisma:studio` | GUI Prisma per ispezionare il DB |
| `npm run prisma:generate` | rigenera il client TypeScript in `generated/prisma/` |
| `npm run prisma:migrate` | `prisma migrate dev` (crea/aggiorna migration) |
| `npm run prisma:deploy` | `prisma migrate deploy` (per produzione) |

## Endpoint API

Base: `/api`. Tutti richiedono autenticazione (cookie `token` httpOnly) tranne:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/health`

Vedi `plans/chaos-radio-player.md` sezione 6 per il contratto completo.

### Auth flow

```
POST /api/auth/register  { email, password, displayName? }  → 201 { user } + Set-Cookie
POST /api/auth/login     { email, password }               → 200 { user } + Set-Cookie
POST /api/auth/logout    (auth)                           → 204 + Clear-Cookie
GET  /api/auth/me         (auth)                           → 200 { user }
```

## Vincoli Prisma 7 / driver adapter

A differenza di Prisma 5, Prisma 7:
1. **NON usa un client MySQL integrato**. Richiede un driver adapter esplicito (`@prisma/adapter-mariadb` + `mariadb`).
2. **Genera solo TypeScript** (`generated/prisma/client.ts`), non più `.js`.
3. **DATABASE_URL** non è più letto da `schema.prisma` ma da `prisma7.config.ts` (in dev si possono usare env vars separate DB_* passate al costruttore `PrismaMariaDb`).

Per eseguire il backend serve Node ≥ 22.6 (per `--experimental-strip-types`).

## Struttura

```
backend/
├── prisma/
│   ├── schema.prisma       # 7 modelli + 1 enum
│   └── migrations/
├── prisma7.config.ts       # config Prisma 7 (DATABASE_URL)
├── generated/
│   └── prisma/             # client TS generato, gitignored
├── src/
│   ├── index.js            # Express entry
│   ├── db.js               # Prisma singleton + driver adapter
│   ├── lib/jwt.js          # sign/verify
│   ├── middleware/
│   │   ├── auth.js         # requireAuth
│   │   ├── error.js        # HttpError + errorHandler
│   │   └── rateLimit.js    # authRateLimit (5/prod, 100/dev)
│   └── routes/
│       ├── auth.routes.js
│       ├── tracks.routes.js
│       ├── favorites.routes.js
│       ├── playlists.routes.js
│       └── notifications.routes.js
├── scripts/                 # Fase 2: scan + seed
├── .env                     # gitignored
├── .env.example
└── package.json             # chaos-radio-backend, type: module
```