#!/usr/bin/env bash
set -euo pipefail

APP_NAME="the-office-on-rent"
APP_USER="crm"
APP_DIR="/home/crm/apps/${APP_NAME}"
PM2_NAME="the-office-on-rent-backend"
BACKEND_PORT="5100"
PUBLIC_URL="https://crm.theofficeonrent.com"
DEFAULT_ARCHIVE="/tmp/the-office-on-rent-release.tar.gz"
BACKUP_DIR="/var/backups/the-office-on-rent"

ARCHIVE="$DEFAULT_ARCHIVE"
CODE_UPDATE=true
INSTALL_DEPS=true
BUILD_FRONTEND=true
RUN_SEED=false

usage() {
  cat <<USAGE
Usage: bash /home/crm/apps/the-office-on-rent/deploy.sh [options]

Options:
  --archive PATH       Use a release archive instead of ${DEFAULT_ARCHIVE}
  --no-code-update     Do not replace app files; just restart/recheck current code
  --skip-install       Skip npm ci for backend/frontend
  --skip-build         Skip frontend build
  --seed-admin         Run npm run seed:admin after deploy
  -h, --help           Show this help

Typical update flow:
  Upload archive to /tmp/the-office-on-rent-release.tar.gz
  bash /home/crm/apps/the-office-on-rent/deploy.sh
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --archive)
      ARCHIVE="${2:-}"
      [[ -n "$ARCHIVE" ]] || { echo "--archive requires a path" >&2; exit 2; }
      shift 2
      ;;
    --no-code-update) CODE_UPDATE=false; shift ;;
    --skip-install) INSTALL_DEPS=false; shift ;;
    --skip-build) BUILD_FRONTEND=false; shift ;;
    --seed-admin) RUN_SEED=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

require_file() {
  [[ -f "$1" ]] || { echo "Required file missing: $1" >&2; exit 1; }
}

run_health_check() {
  local url="$1"
  local label="$2"
  local attempts="${3:-20}"
  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS "$url" >/tmp/the-office-deploy-health.json 2>/tmp/the-office-deploy-health.err; then
      echo "${label}: OK"
      cat /tmp/the-office-deploy-health.json
      echo
      return 0
    fi
    sleep 2
  done
  echo "${label}: FAILED" >&2
  cat /tmp/the-office-deploy-health.err >&2 || true
  return 1
}

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root so Nginx/system services can reload. App process still runs as ${APP_USER}." >&2
  exit 1
fi

id "$APP_USER" >/dev/null 2>&1 || { echo "App user missing: $APP_USER" >&2; exit 1; }
require_file "$APP_DIR/backend/.env"
mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d-%H%M%S)"

echo "== Deploying ${APP_NAME} at ${TS} =="

if [[ "$CODE_UPDATE" == true ]]; then
  require_file "$ARCHIVE"
  echo "== Backing up current release =="
  tar -czf "$BACKUP_DIR/app-${TS}.tar.gz" -C /home/crm/apps "$APP_NAME"

  echo "== Preparing new release from ${ARCHIVE} =="
  rm -rf "${APP_DIR}.new" "${APP_DIR}.prev"
  mkdir -p "${APP_DIR}.new"
  tar -xzf "$ARCHIVE" -C "${APP_DIR}.new"

  echo "== Preserving VPS runtime files =="
  cp -a "$APP_DIR/backend/.env" "${APP_DIR}.new/backend/.env"
  chown "$APP_USER:$APP_USER" "${APP_DIR}.new/backend/.env"
  chmod 600 "${APP_DIR}.new/backend/.env"

  if [[ -f "$APP_DIR/frontend/.env.production" ]]; then
    cp -a "$APP_DIR/frontend/.env.production" "${APP_DIR}.new/frontend/.env.production"
  else
    cat >"${APP_DIR}.new/frontend/.env.production" <<'FRONTEND_ENV'
VITE_API_BASE_URL=/api/client
VITE_SOCKET_URL=
VITE_SOCKET_PATH=/socket.io
FRONTEND_ENV
  fi

  # Preserve this VPS-specific deploy script even if the uploaded repo archive contains an older deploy.sh.
  cp -a "$APP_DIR/deploy.sh" "${APP_DIR}.new/deploy.sh"

  # Runtime data lives only on this server, so it is always carried into the
  # new release - merged in, with the server's copy of any file winning.
  #
  # This used to copy it only when the release had no such folder. git tracks
  # backend/uploads/.gitkeep, so any archive built from the repo has the folder,
  # and every such deploy silently left all uploads behind in .prev: 57 files
  # across Sept-Oct 2026, one of them never recovered.
  for path in backend/uploads backend/storage uploads storage; do
    if [[ -d "$APP_DIR/$path" ]]; then
      mkdir -p "${APP_DIR}.new/$path"
      cp -a "$APP_DIR/$path/." "${APP_DIR}.new/$path/"
      before=$(find "$APP_DIR/$path" -type f | wc -l)
      after=$(find "${APP_DIR}.new/$path" -type f | wc -l)
      # Refuse to swap rather than lose data: the live release is untouched.
      if (( after < before )); then
        echo "ABORT: $path has $before files live but only $after in the new release" >&2
        exit 1
      fi
      echo "Preserved $path: $before live files carried over ($after in new release)"
    fi
  done

  mv "$APP_DIR" "${APP_DIR}.prev"
  mv "${APP_DIR}.new" "$APP_DIR"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
else
  echo "== Skipping code replacement =="
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
fi

chmod -R go-w "$APP_DIR"
find "$APP_DIR" -type d -exec chmod 755 {} +
chmod 600 "$APP_DIR/backend/.env"
chmod 755 "$APP_DIR/deploy.sh"

if [[ "$INSTALL_DEPS" == true ]]; then
  echo "== Installing backend dependencies =="
  cd "$APP_DIR/backend"
  sudo -H -u "$APP_USER" npm ci --omit=dev

  echo "== Installing frontend dependencies =="
  cd "$APP_DIR/frontend"
  sudo -H -u "$APP_USER" npm ci
else
  echo "== Skipping dependency install =="
fi

if [[ "$BUILD_FRONTEND" == true ]]; then
  echo "== Building frontend =="
  cd "$APP_DIR/frontend"
  sudo -H -u "$APP_USER" npm run build
else
  echo "== Skipping frontend build =="
fi

if [[ "$RUN_SEED" == true ]]; then
  echo "== Seeding admin =="
  cd "$APP_DIR/backend"
  sudo -H -u "$APP_USER" npm run seed:admin
fi

echo "== Restarting backend with PM2 as ${APP_USER} =="
cd "$APP_DIR/backend"
if sudo -H -u "$APP_USER" pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  sudo -H -u "$APP_USER" pm2 reload "$PM2_NAME" --update-env
else
  sudo -H -u "$APP_USER" bash -lc "cd '$APP_DIR/backend' && NODE_ENV=production PORT='$BACKEND_PORT' pm2 start src/server.js --name '$PM2_NAME' --time --update-env"
fi
sudo -H -u "$APP_USER" pm2 save
systemctl enable pm2-"$APP_USER" >/dev/null 2>&1 || true
systemctl start pm2-"$APP_USER" >/dev/null 2>&1 || true

echo "== Reloading Nginx =="
nginx -t
systemctl reload nginx

echo "== Health checks =="
run_health_check "http://127.0.0.1:${BACKEND_PORT}/api/health" "Backend direct"
run_health_check "${PUBLIC_URL}/api/health" "Nginx HTTPS proxy"
curl -fsS -I "${PUBLIC_URL}/" | head -20

echo "== Runtime status =="
sudo -H -u "$APP_USER" pm2 status --no-color
systemctl is-active mongod nginx pm2-"$APP_USER" fail2ban

echo "== Deploy complete =="