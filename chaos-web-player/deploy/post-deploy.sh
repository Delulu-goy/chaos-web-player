#!/bin/bash
# Chaos Radio — post-deploy script (script di BOOTSTRAP, una tantum)
#
# NON è il deploy: il deploy è la pipeline cPanel (`.cpanel.yml`) o il
# workflow GitHub Actions. Questo script serve solo alla PRIMA
# installazione (o a un bootstrap manuale via SSH) per preparare le
# cartelle private, i permessi e le dipendenze.
#
# Uso:
#   bash deploy/post-deploy.sh /home/<user>/radio.chaosroom.online/chaos-web-player/backend
#
# Note:
# - `prisma generate` e `prisma migrate deploy` NON funzionano su Stellar
#   (binari WASM non scaricabili): il client Prisma è committato in
#   `generated/prisma/` e le migration si applicano da phpMyAdmin. Qui
#   falliscono senza bloccare il resto.

set -e

APP_ROOT="${1:-$(pwd)}"
echo "[chaos-deploy] application root: $APP_ROOT"

# 1. Cartelle private (MP3, cover, waveform, log)
mkdir -p "$APP_ROOT/private/audio"
mkdir -p "$APP_ROOT/private/covers"
mkdir -p "$APP_ROOT/private/waveforms"
mkdir -p "$APP_ROOT/logs"
mkdir -p "$APP_ROOT/tmp"
chmod 755 "$APP_ROOT/private"
echo "✓ private/ directories created"

# 2. Verifica .env (usato da script CLI e cron: l'app usa il pannello)
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

# 4. Prisma generate (su Stellar fallisce: si usa il client committato)
echo "→ running prisma generate (può fallire su Stellar: ok)..."
npx prisma generate || echo "⚠ prisma generate non eseguibile: si usa il client committato in generated/prisma/"

# 5. Migration (su Stellar fallisce: si applica da phpMyAdmin)
echo "→ running prisma migrate deploy (può fallire su Stellar: ok)..."
npx prisma migrate deploy || echo "⚠ prisma migrate deploy non eseguibile: applica la migration da phpMyAdmin"

# 6. Seed (opzionale): popola dati demo. NON eseguire in produzione se
#    l'edizione Pirate Day è attiva.
if [ -f "$APP_ROOT/scripts/seed.js" ]; then
  echo "→ scripts/seed.js presente: NON eseguito automaticamente (dati demo)"
  echo "  esegui 'npm run seed' a mano solo se ti servono i dati demo"
else
  echo "ℹ scripts/seed.js non trovato — skip"
fi

echo ""
echo "✅ Bootstrap completato."
echo "→ Ora riavvia il Node.js App dal pannello (o: touch $APP_ROOT/tmp/restart.txt)"
echo "→ Verifica: curl -s https://radio.chaosroom.online/api/debug"
