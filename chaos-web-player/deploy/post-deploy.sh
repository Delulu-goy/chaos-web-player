#!/bin/bash
# Chaos Radio — post-deploy script (eseguire UNA volta dopo l'upload)
# Crea le cartelle private se non esistono, applica le migration.

set -e

APP_ROOT="${1:-$(pwd)}"
echo "[chaos-deploy] using app root: $APP_ROOT"

# 1. Cartelle private
mkdir -p "$APP_ROOT/private/audio"
mkdir -p "$APP_ROOT/private/covers"
chmod 755 "$APP_ROOT/private"
echo "✓ private/ directories created"

# 2. Verifica .env
if [ ! -f "$APP_ROOT/.env" ]; then
  echo "✗ .env not found. Create it from .env.example before running this script."
  exit 1
fi
echo "✓ .env present"

# 3. Verifica dipendenze installate
if [ ! -d "$APP_ROOT/node_modules" ]; then
  echo "→ running npm install --production..."
  npm install --production
fi
echo "✓ node_modules present"

# 4. Prisma generate (idempotente)
echo "→ running prisma generate..."
npx prisma generate

# 5. Migration
echo "→ running prisma migrate deploy..."
npx prisma migrate deploy

# 6. (Opzionale) Seed se script esiste
if [ -f "$APP_ROOT/scripts/seed.js" ]; then
  echo "→ running seed..."
  npm run seed
else
  echo "ℹ scripts/seed.js not found (Fase 2 non ancora implementata) — skip"
fi

echo ""
echo "✅ Deploy bootstrap completato."
echo "→ Ora riavvia il Node.js App dal pannello cPanel Setup Node.js App."