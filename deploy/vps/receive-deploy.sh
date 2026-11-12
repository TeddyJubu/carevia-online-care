#!/usr/bin/env bash
# Runs on the VPS as ~/carevia/bin/receive-deploy. deploy.sh pipes it a release tarball (site/ app/ admin/ src/)
# and it puts that live. It is also the forced command of the GitHub Actions deploy key, so that key can do
# nothing else. Edited here? Reinstall by hand:
#   scp deploy/vps/receive-deploy.sh sandbox:carevia/bin/receive-deploy.new && ssh sandbox mv carevia/bin/receive-deploy.new carevia/bin/receive-deploy
# (mv, not scp over it: bash reads a running script as it goes, so overwriting it in place breaks a deploy in flight.)
set -euo pipefail
umask 022

# "receive-deploy has-assets <git tree hash of src/assets>" prints yes when the live homepage assets are that tree,
# so deploy.sh can leave the 65 MB of images out of the upload. A forced command gets its request only through
# SSH_ORIGINAL_COMMAND; a hand run over a normal key gets it as arguments. The hash is only compared, never run.
read -r -a req <<<"${SSH_ORIGINAL_COMMAND:-receive-deploy $*}"
if [ "${req[1]:-}" = has-assets ]; then
  [ -n "${req[2]:-}" ] && [ "$(cat ~/carevia/assets-tree 2>/dev/null)" = "${req[2]}" ] && echo yes || echo no
  exit 0
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
tar -x -C "$tmp"
cd ~
# One deploy at a time on the server: a hand deploy overlapping an Actions one makes compose fight over containers.
# Taken after the upload, so a slow upload doesn't hold it.
exec 9>carevia/deploy.lock
flock -w 900 9 || { echo "Another deploy has held carevia/deploy.lock for 15 minutes."; exit 1; }

if [ -d "$tmp/site/assets" ]; then
  rsync -a --delete --exclude .DS_Store --exclude /app --exclude /admin "$tmp/site/" telemed-project/
  # Old deploy.sh sends assets without a tree hash: forget the hash rather than keep a stale one.
  cp "$tmp/assets-tree" carevia/assets-tree 2>/dev/null || rm -f carevia/assets-tree
else
  rsync -a --delete --exclude .DS_Store --exclude /app --exclude /admin --exclude /assets "$tmp/site/" telemed-project/
fi
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
