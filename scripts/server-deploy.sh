#!/usr/bin/env bash
# Run on Namecheap SSH after: git pull
# Usage: bash scripts/server-deploy.sh
# First-time wipe (ONCE): FRESH_DB=1 bash scripts/server-deploy.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

find_composer() {
  if command -v composer >/dev/null 2>&1; then
    echo "composer"
    return
  fi
  for candidate in \
    /opt/cpanel/composer/bin/composer \
    /usr/local/bin/composer \
    "$HOME/bin/composer" \
    "$ROOT/backend/composer.phar"
  do
    if [[ -x "$candidate" ]] || [[ -f "$candidate" ]]; then
      echo "php $candidate"
      return
    fi
  done
  echo ""
}

COMPOSER_CMD="$(find_composer)"

if [[ -z "$COMPOSER_CMD" ]]; then
  echo "==> Composer not found — downloading composer.phar"
  php -r "copy('https://getcomposer.org/installer', 'composer-setup.php');"
  php composer-setup.php --quiet
  rm -f composer-setup.php
  COMPOSER_CMD="php $ROOT/backend/composer.phar"
fi

echo "==> Composer install ($COMPOSER_CMD)"
# shellcheck disable=SC2086
$COMPOSER_CMD install --no-dev --optimize-autoloader --no-interaction

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
