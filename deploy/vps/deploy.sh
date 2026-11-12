#!/usr/bin/env bash
# Deploys the committed HEAD to https://carevia.triplelabs.dev:
#   /        homepage (build.mjs → dist/)
#   /app/    patient portal (apps/web, demo build)
#   /admin/  admin app (apps/admin, demo build)
#   /api/    API + Postgres in Docker on the VPS
# Usage: deploy/vps/deploy.sh [--seed]   (--seed: first deploy only, never on production now; demo resets go through POST /api/demo/reset)
# Every push to main runs this from GitHub Actions (.github/workflows/deploy.yml); run it by hand only to redeploy.
set -euo pipefail
cd "$(dirname "$0")/../.."
HOST=${DEPLOY_HOST:-sandbox}
git diff --quiet HEAD || { echo "Commit first: deploys ship HEAD only."; exit 1; }

node build.mjs
VITE_DEMO=1 npm run build --prefix apps/web
VITE_DEMO_MODE=true npm run build --prefix apps/admin

# One tarball to the server; ~/carevia/bin/receive-deploy (deploy/vps/receive-deploy.sh) puts it live.
# API source from HEAD: package files for every workspace (npm ci needs them), apps/api, content, deploy.
rel=$(mktemp -d); trap 'rm -rf "$rel"' EXIT
mkdir -p "$rel/src" && git archive HEAD package.json package-lock.json apps/api content deploy $(git ls-files 'apps/*/package.json') | tar -x -C "$rel/src"
cp -R dist "$rel/site" && cp -R apps/web/dist "$rel/app" && cp -R apps/admin/dist "$rel/admin"
# dist/assets is a verbatim copy of src/assets (65 MB of images), so its git tree hash says whether the server
# already has it; if so it stays out of the upload (a slow runner-to-VPS link once took 15+ minutes for it).
tree=$(git rev-parse HEAD:src/assets)
if [ "$(ssh "$HOST" carevia/bin/receive-deploy has-assets "$tree")" = yes ]; then
  rm -rf "$rel/site/assets" && echo "Homepage assets unchanged ($tree), not uploading them."
else
  echo "$tree" > "$rel/assets-tree"
fi
COPYFILE_DISABLE=1 tar -c -C "$rel" . | ssh "$HOST" carevia/bin/receive-deploy
if [ "${1:-}" = "--seed" ]; then
  ssh "$HOST" 'cd ~/carevia/src/deploy/vps && docker compose --env-file ~/carevia/api.env exec -T api npx prisma db seed'
fi

for i in $(seq 1 30); do
  curl -fsS https://carevia.triplelabs.dev/api/health && { echo; echo "Deployed $(git rev-parse --short HEAD)"; exit 0; }
  sleep 2
done
echo "API health check failed"; exit 1
