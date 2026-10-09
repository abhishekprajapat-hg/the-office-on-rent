#!/usr/bin/env bash
# Deploy the CRM (The Office On Rent) on the VPS from a GitHub branch. Run AS THE crm USER:
#   su - crm -c 'bash /home/crm/deploy-crm.sh main'
# Safe: backs up backend/src and frontend/dist first, builds the frontend into dist.new and swaps it in
# only if the build worked, never touches .env, uploads or node_modules, restarts only the CRM process,
# and restores everything automatically if the backend does not answer /api/health afterwards.
set -euo pipefail
BRANCH="${1:-main}"
APP="${APP_DIR:-/home/crm/apps/the-office-on-rent}"
PM2_NAME="${PM2_NAME:-the-office-on-rent-backend}"
REPO_URL="${REPO_URL:-https://github.com/abhishekprajapat-hg/the-office-on-rent}"
SRC="${SRC_DIR:-$HOME/deploy-src}"
TS="$(date +%F-%H%M)"
say() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
[ -d "$APP/backend" ] && [ -d "$APP/frontend" ] || die "CRM folder not found at $APP"

say "Fetching $BRANCH"
rm -rf "$SRC"
git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$SRC"
echo "Deploying: $(git -C "$SRC" log --oneline -1)"

say "Backing up current backend/src and frontend/dist"
cp -a "$APP/backend/src" "$APP/backend/src.bak-$TS"
rm -rf "$APP/frontend/dist.old"; [ -d "$APP/frontend/dist" ] && cp -a "$APP/frontend/dist" "$APP/frontend/dist.old"
OLD_PKG="$(mktemp)"; cp "$APP/backend/package-lock.json" "$OLD_PKG" 2>/dev/null || true

restore() {
  say "RESTORING the previous version"
  rm -rf "$APP/backend/src" && cp -a "$APP/backend/src.bak-$TS" "$APP/backend/src" || true
  [ -d "$APP/frontend/dist.old" ] && { rm -rf "$APP/frontend/dist" && cp -a "$APP/frontend/dist.old" "$APP/frontend/dist"; } || true
  pm2 restart "$PM2_NAME" --update-env >/dev/null 2>&1 || true
}

say "Updating the backend (code + dependencies; .env, uploads untouched)"
rm -rf "$APP/backend/src" && cp -a "$SRC/backend/src" "$APP/backend/src"
rm -rf "$APP/backend/scripts" && cp -a "$SRC/backend/scripts" "$APP/backend/scripts" 2>/dev/null || true
cp "$SRC/backend/package.json" "$SRC/backend/package-lock.json" "$APP/backend/"
(cd "$APP/backend" && npm ci --omit=dev) || { restore; die "Backend dependency install failed; previous version restored."; }

say "Building the frontend (the live site is untouched until this succeeds)"
cd "$SRC/frontend"
for f in $(ls -A | grep -vE '^(node_modules|dist|dist\..*|\.env.*)$'); do cp -a "$f" "$APP/frontend/"; done
cd "$APP/frontend"
if ! { rm -rf dist.new && npm ci && npx vite build --outDir dist.new --emptyOutDir; } || [ ! -f dist.new/index.html ]; then
  restore; die "Frontend build failed; previous version restored, live site unchanged."
fi
rm -rf dist && mv dist.new dist

say "Restarting the CRM backend only"
pm2 restart "$PM2_NAME" --update-env >/dev/null
PORT_ENV="$(grep -E '^PORT=' "$APP/backend/.env" 2>/dev/null | cut -d= -f2 | tr -d '\r"' || true)"
ok=""
for _ in $(seq 1 12); do
  sleep 3
  for p in $PORT_ENV 5100 5000; do
    [ -n "$p" ] || continue
    if curl -fsS "http://127.0.0.1:$p/api/health" >/dev/null 2>&1; then ok="$p"; break 2; fi
  done
done
[ -n "$ok" ] || { restore; die "CRM did not answer /api/health. Previous version restored. See: pm2 logs $PM2_NAME --lines 40"; }
pm2 ls
say "Deployed OK (CRM answering on port $ok). Hard-refresh the browser (Ctrl+Shift+R)."
echo "Undo later: cp -a $APP/backend/src.bak-$TS ... (backup kept) and mv/cp $APP/frontend/dist.old back to dist."
