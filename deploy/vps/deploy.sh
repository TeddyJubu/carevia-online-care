#!/usr/bin/env bash
# Deploys the committed HEAD to https://carevia.claudemod.tech:
#   /        homepage (build.mjs → dist/)
#   /app/    patient portal (apps/web, demo build)
#   /admin/  admin app (apps/admin, demo build)
#   /api/    API + Postgres in Docker on the VPS
# Usage: deploy/vps/deploy.sh [--seed]   (--seed: first deploy only; demo resets go through POST /api/demo/reset)
set -euo pipefail
cd "$(dirname "$0")/../.."
HOST=${DEPLOY_HOST:-sandbox}
git diff --quiet HEAD || { echo "Commit first: deploys ship HEAD only."; exit 1; }

node build.mjs
VITE_DEMO=1 npm run build --prefix apps/web
[ -d apps/admin ] && VITE_DEMO_MODE=true npm run build --prefix apps/admin

rsync -az --delete --exclude .DS_Store --exclude /app --exclude /admin dist/ "$HOST:telemed-project/"
rsync -az --delete apps/web/dist/ "$HOST:telemed-project/app/"
[ -d apps/admin/dist ] && rsync -az --delete apps/admin/dist/ "$HOST:telemed-project/admin/"

# API source from HEAD: package files for every workspace (npm ci needs them), apps/api, content, deploy.
git archive HEAD package.json package-lock.json apps/api content deploy $(git ls-files 'apps/*/package.json') \
  | ssh "$HOST" 'rm -rf ~/carevia/src && mkdir -p ~/carevia/src && tar -x -C ~/carevia/src'

ssh "$HOST" "cd ~/carevia/src/deploy/vps && docker compose --env-file ~/carevia/api.env up -d --build --wait \
  && sudo nginx -t && sudo systemctl reload nginx"
if [ "${1:-}" = "--seed" ]; then
  ssh "$HOST" 'cd ~/carevia/src/deploy/vps && docker compose --env-file ~/carevia/api.env exec -T api npx prisma db seed'
fi

for i in $(seq 1 30); do
  curl -fsS https://carevia.claudemod.tech/api/health && { echo; echo "Deployed $(git rev-parse --short HEAD)"; exit 0; }
  sleep 2
done
echo "API health check failed"; exit 1
