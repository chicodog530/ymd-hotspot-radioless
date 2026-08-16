#!/usr/bin/env bash
set -euo pipefail
umask 027

REPO_URL="https://github.com/merberg-ai/ywd-hotspot.git"
REPO_DIR="/opt/ywd-hotspot/repo"
BRANCH="main"

if [[ $EUID -ne 0 ]]; then exec sudo bash "$0" "$@"; fi

cat <<'EOF'
============================================================
 YWD-Hotspot: adopt existing install for GitHub updates
============================================================
This does NOT rebuild MMDVM-Host or DMRGateway.
Existing configuration, credentials, calibration data, and RF state are preserved.
EOF

[[ -f /etc/ywd-hotspot/config.json ]] || { echo "[FAIL] /etc/ywd-hotspot/config.json not found. This migration is for an existing install."; exit 1; }
[[ -d /opt/ywd-hotspot/app ]] || { echo "[FAIL] /opt/ywd-hotspot/app not found."; exit 1; }
id ywd-hotspot >/dev/null 2>&1 || { echo "[FAIL] ywd-hotspot service account not found."; exit 1; }

if ! command -v git >/dev/null 2>&1; then
  echo "Installing git..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends git ca-certificates
fi

if [[ -d "$REPO_DIR/.git" ]]; then
  origin="$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null || true)"
  case "$origin" in
    "$REPO_URL"|"https://github.com/merberg-ai/ywd-hotspot"|"git@github.com:merberg-ai/ywd-hotspot.git") ;;
    *) echo "[FAIL] Existing $REPO_DIR uses unexpected origin '$origin'."; exit 1;;
  esac
else
  if [[ -e "$REPO_DIR" ]]; then
    echo "[FAIL] $REPO_DIR exists but is not a Git repository. Move it aside and retry."
    exit 1
  fi
  install -d -m 0755 /opt/ywd-hotspot
  echo "Cloning $REPO_URL -> $REPO_DIR"
  git clone --quiet --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
fi

# The managed checkout is source state, not the deployed runtime. Do not chmod
# files inside it: changing tracked executable bits makes Git report a dirty
# tree. Content modifications are still detected; mode-only drift is ignored.
git -C "$REPO_DIR" config core.fileMode false

if [[ -n "$(git -C "$REPO_DIR" status --porcelain)" ]]; then
  echo "[FAIL] Existing managed checkout has local content changes."
  git -C "$REPO_DIR" status --short
  exit 1
fi

echo "Refreshing/validating managed checkout..."
bash "$REPO_DIR/GITHUB-UPDATE.sh" --branch "$BRANCH"

echo
cat <<'EOF'
Migration complete. Future source updates are now managed through GitHub.

Useful commands:
  sudo ywd-hotspotctl update --check
  sudo ywd-hotspotctl update --dry-run
  sudo ywd-hotspotctl update
  ywd-hotspotctl source
EOF
