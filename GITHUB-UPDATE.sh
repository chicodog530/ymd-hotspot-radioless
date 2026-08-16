#!/usr/bin/env bash
set -euo pipefail
umask 027

REPO_URL="https://github.com/merberg-ai/ywd-hotspot.git"
REPO_DIR="/opt/ywd-hotspot/repo"
BUILD_INFO="/etc/ywd-hotspot/build-info.json"
MODE="update"
BRANCH="main"
TAG=""

if [[ $EUID -ne 0 ]]; then exec sudo "$0" "$@"; fi

usage(){
  cat <<'EOF'
Usage: GITHUB-UPDATE.sh [--check|--dry-run] [--branch NAME|--tag TAG]

  --check       Fetch metadata and report whether an update is available.
  --dry-run     Fetch and validate the candidate without changing the live install.
  --branch NAME Update from a branch (default: main).
  --tag TAG     Update to a specific tag instead of a branch.
EOF
}

while (($#)); do
  case "$1" in
    --check) MODE="check";;
    --dry-run) MODE="dry-run";;
    --branch) shift; BRANCH="${1:-}"; [[ -n "$BRANCH" ]] || { echo "[FAIL] --branch requires a name"; exit 2; }; TAG="";;
    --tag) shift; TAG="${1:-}"; [[ -n "$TAG" ]] || { echo "[FAIL] --tag requires a tag"; exit 2; };;
    -h|--help) usage; exit 0;;
    *) echo "[FAIL] Unknown argument: $1"; usage; exit 2;;
  esac
  shift
done

command -v git >/dev/null 2>&1 || { echo "[FAIL] git is not installed."; exit 1; }
command -v flock >/dev/null 2>&1 || { echo "[FAIL] flock is unavailable (util-linux is required)."; exit 1; }
[[ -f /etc/ywd-hotspot/config.json ]] || { echo "[FAIL] No existing YWD-Hotspot installation found."; exit 1; }
[[ -d "$REPO_DIR/.git" ]] || {
  echo "[FAIL] GitHub-managed checkout not found at $REPO_DIR"
  echo "       Run MIGRATE-TO-GITHUB.sh once to adopt the existing installation."
  exit 1
}

exec 9>/run/ywd-hotspot-update.lock
flock -n 9 || { echo "[FAIL] Another YWD-Hotspot update is already running."; exit 1; }

origin="$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null || true)"
case "$origin" in
  "$REPO_URL"|"https://github.com/merberg-ai/ywd-hotspot"|"git@github.com:merberg-ai/ywd-hotspot.git") ;;
  *) echo "[FAIL] Refusing update: unexpected origin '$origin'"; exit 1;;
esac

if [[ -n "$(git -C "$REPO_DIR" status --porcelain 2>/dev/null)" ]]; then
  echo "[FAIL] $REPO_DIR has local modifications. Refusing to overwrite them."
  git -C "$REPO_DIR" status --short
  exit 1
fi

echo "Fetching YWD-Hotspot from GitHub while the live hotspot remains running..."
git -C "$REPO_DIR" fetch --quiet --prune --tags origin

if [[ -n "$TAG" ]]; then
  target_ref="refs/tags/$TAG"
  label="tag:$TAG"
  git -C "$REPO_DIR" show-ref --verify --quiet "$target_ref" || { echo "[FAIL] Tag '$TAG' not found."; exit 1; }
else
  target_ref="refs/remotes/origin/$BRANCH"
  label="$BRANCH"
  git -C "$REPO_DIR" show-ref --verify --quiet "$target_ref" || { echo "[FAIL] Branch '$BRANCH' not found on origin."; exit 1; }
fi

target_sha="$(git -C "$REPO_DIR" rev-parse "$target_ref^{commit}")"
target_short="${target_sha:0:10}"
target_date="$(git -C "$REPO_DIR" show -s --format=%cI "$target_sha")"
target_version="$(git -C "$REPO_DIR" show "$target_sha:VERSION" 2>/dev/null | tr -d '\r\n' || true)"
installed_version="$(cat /opt/ywd-hotspot/app/VERSION 2>/dev/null || echo unknown)"
installed_sha="$(python3 - "$BUILD_INFO" <<'PY'
import json,sys
try: print(json.load(open(sys.argv[1])).get('commit','unknown'))
except Exception: print('unknown')
PY
)"
installed_short="${installed_sha:0:10}"
[[ "$installed_sha" == "unknown" || -z "$installed_sha" ]] && installed_short="unknown"

cat <<EOF
Installed : $installed_version
Commit    : $installed_short
Target    : ${target_version:-unknown}
Source    : $label @ $target_short
Date      : $target_date
EOF

if [[ "$installed_sha" == "$target_sha" && "$installed_version" == "$target_version" ]]; then
  echo "Status    : up to date"
  exit 0
fi

echo "Status    : update available"
[[ "$MODE" == "check" ]] && exit 0

stage="$(mktemp -d /opt/ywd-hotspot/.update-stage.XXXXXX)"
cleanup(){ rm -rf "$stage"; }
trap cleanup EXIT

git -C "$REPO_DIR" archive "$target_sha" | tar -x -C "$stage"

required=(
  VERSION UPDATE.sh INSTALL.sh UNINSTALL.sh GITHUB-UPDATE.sh MIGRATE-TO-GITHUB.sh
  bin/ywd-hotspotctl lab/mmdvm-diag.sh
  lib/dashboard.py lib/admin.py lib/build_info.py lib/generate-config.py lib/migrate.py
  web/index.html web/app.js web/style.css
  sudoers/ywd-hotspot systemd/ywd-mmdvmhost.service systemd/ywd-dmrgateway.service
  systemd/ywd-dashboard.service systemd/ywd-activity.service
  assets/branding/ywd-hotspot-badge-256.webp
)
for f in "${required[@]}"; do
  [[ -e "$stage/$f" ]] || { echo "[FAIL] Candidate is missing required file: $f"; exit 1; }
done

for f in UPDATE.sh INSTALL.sh GITHUB-UPDATE.sh MIGRATE-TO-GITHUB.sh UNINSTALL.sh bin/ywd-hotspotctl lab/mmdvm-diag.sh; do
  [[ -f "$stage/$f" ]] && bash -n "$stage/$f"
done
python3 -m py_compile "$stage"/lib/*.py

echo "Candidate validation: OK"
if [[ "$MODE" == "dry-run" ]]; then
  echo "Dry run complete. The live installation and service state were not changed."
  exit 0
fi

echo
read -r -p "Apply $target_version from $label @ $target_short? [y/N]: " answer
[[ "$answer" =~ ^[Yy]$ ]] || { echo "Cancelled."; exit 0; }

echo "Applying validated candidate. UPDATE.sh will preserve the current RF/service policy..."
YWD_SOURCE_TYPE=github \
YWD_SOURCE_STATE=clean \
YWD_GIT_BRANCH="$label" \
YWD_GIT_COMMIT="$target_sha" \
YWD_GIT_COMMIT_DATE="$target_date" \
  "$stage/UPDATE.sh"

# Move the managed source checkout only after the live update succeeds.
if [[ -n "$TAG" ]]; then
  git -C "$REPO_DIR" checkout --quiet --detach "$target_sha"
else
  git -C "$REPO_DIR" checkout --quiet -B "$BRANCH" "$target_sha"
  git -C "$REPO_DIR" branch --set-upstream-to="origin/$BRANCH" "$BRANCH" >/dev/null 2>&1 || true
fi

echo
echo "GitHub source checkout updated successfully."
/usr/local/sbin/ywd-hotspotctl source 2>/dev/null || true
