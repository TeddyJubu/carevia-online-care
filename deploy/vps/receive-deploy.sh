#!/usr/bin/env bash
# Runs on the VPS as ~/carevia/bin/receive-deploy. deploy.sh pipes it a release tarball (site/ app/ admin/ src/)
# and it puts that live. It is also the forced command of the GitHub Actions deploy key, so that key can do
# nothing else. Edited here? Reinstall by hand:
#   scp deploy/vps/receive-deploy.sh sandbox:carevia/bin/receive-deploy
set -euo pipefail
umask 022
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
tar -x -C "$tmp"
cd ~

rsync -a --delete --exclude .DS_Store --exclude /app --exclude /admin "$tmp/site/" telemed-project/
# Keep earlier hashed assets so tabs opened before this deploy can still load their pages; prune after 7 days.
rsync -a --delete --filter='P assets/**' "$tmp/app/" telemed-project/app/
rsync -a --delete --filter='P assets/**' "$tmp/admin/" telemed-project/admin/
find telemed-project/app/assets telemed-project/admin/assets -type f -mtime +7 -delete 2>/dev/null || true

rm -rf carevia/src && mv "$tmp/src" carevia/src
cd carevia/src/deploy/vps
# Output goes to a file: compose's build helpers can keep the ssh session's stdout open and hang the deploy.
log=~/carevia/last-deploy.log
docker compose --env-file ~/carevia/api.env up -d --build --wait </dev/null >"$log" 2>&1 || { tail -40 "$log"; exit 1; }
tail -5 "$log"
sudo nginx -t && sudo systemctl reload nginx
