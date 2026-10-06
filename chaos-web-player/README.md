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

- **Frontend**: Vite + React 19 + TypeScript + Tailwind v3 + Zustand + React Router v7
- **Backend**: Node 24 + Express 5 + Prisma 7 (MySQL) + JWT + bcrypt
- **Deploy**: Namecheap Stellar (cPanel Application Manager), subdomain `radio.chaosroom.online`

## Quickstart (sviluppo)

### Backend

```bash
cd backend
npm install
# Crea DB locale MySQL, poi aggiorna DATABASE_URL in .env
npx prisma migrate dev
npm run dev
```

Server in ascolto su `http://localhost:3001`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App in ascolto su `http://localhost:5173`. Puntando al backend su `http://localhost:3001/api`.

## Script utili

| Path       | Script       | Azione |
|------------|--------------|--------|
| `backend/` | `npm run dev` | nodemon Express su 3001 |
| `backend/` | `npm run scan` | scansiona cartella MP3, aggiorna DB |
| `backend/` | `npm run seed` | popola DB con dati demo |
| `backend/` | `npm run prisma:studio` | GUI per DB |
| `frontend/`| `npm run dev` | Vite dev server su 5173 |
| `frontend/`| `npm run build` | build produzione in `dist/` |

## Riferimenti

- Piano dettagliato: [`plans/chaos-radio-player.md`](./plans/chaos-radio-player.md)