#!/usr/bin/env bash
# Run on Namecheap SSH after: git pull
# Usage: bash scripts/server-deploy.sh
# First-time wipe (ONCE): FRESH_DB=1 bash scripts/server-deploy.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

echo "==> Composer install"
composer install --no-dev --optimize-autoloader --no-interaction

if [[ ! -f .env ]]; then
  echo "ERROR: backend/.env missing. Copy .env.example and fill DB + APP_KEY first."
  exit 1
fi

echo "==> Storage / cache dirs"
mkdir -p storage/framework/{cache,sessions,views} storage/logs bootstrap/cache
chmod -R ug+rwx storage bootstrap/cache || true

if [[ "${FRESH_DB:-0}" == "1" ]]; then
  echo "==> FRESH DB (wipe + seed) — irreversible"
  php artisan migrate:fresh --seed --force
else
  echo "==> Migrate"
  php artisan migrate --force
fi

echo "==> Optimize"
php artisan config:cache
php artisan route:cache
php artisan view:cache

echo "==> Done. Queue runs via cron: * * * * * php $ROOT/backend/artisan schedule:run"
