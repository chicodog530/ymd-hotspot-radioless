#!/usr/bin/env bash
set -euo pipefail
umask 027

REPO_URL="https://github.com/merberg-ai/ywd-hotspot.git"
REPO_DIR="/opt/ywd-hotspot/repo"
BUILD_INFO="/etc/ywd-hotspot/build-info.json"
CHANNEL_FILE="/etc/ywd-hotspot/update-channel"
MODE="update"
BRANCH="main"
BRANCH_EXPLICIT=0
TAG=""

if [[ $EUID -ne 0 ]]; then exec sudo bash "$0" "$@"; fi

usage(){
  cat <<'EOF'
Usage: GITHUB-UPDATE.sh [--check|--dry-run] [--branch NAME|--tag TAG]

  --check       Fetch metadata and report whether an update is available.
  --dry-run     Fetch and validate the candidate without changing the live install.
  --branch NAME Update from a branch. A successful main/dev/dev-plugins update becomes the saved channel.
  --tag TAG     Update to a specific tag without changing the saved update channel.

With no --branch/--tag, the saved update channel is used. If no channel file
exists yet, the current managed-checkout branch is used, then main as fallback.
EOF
}

while (($#)); do
  case "$1" in
    --check) MODE="check";;
    --dry-run) MODE="dry-run";;
    --branch) shift; BRANCH="${1:-}"; [[ -n "$BRANCH" ]] || { echo "[FAIL] --branch requires a name"; exit 2; }; BRANCH_EXPLICIT=1; TAG="";;
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

git -C "$REPO_DIR" config core.fileMode false
if [[ -n "$(git -C "$REPO_DIR" status --porcelain 2>/dev/null)" ]]; then
  echo "[FAIL] $REPO_DIR has local content modifications. Refusing to overwrite them."
  git -C "$REPO_DIR" status --short
  exit 1
fi

saved_channel=""
if [[ -r "$CHANNEL_FILE" ]]; then
  saved_channel="$(tr -d '[:space:]' < "$CHANNEL_FILE" 2>/dev/null || true)"
  case "$saved_channel" in main|dev|dev-plugins) ;; *) saved_channel="";; esac
fi
checkout_branch="$(git -C "$REPO_DIR" branch --show-current 2>/dev/null || true)"
case "$checkout_branch" in main|dev|dev-plugins) ;; *) checkout_branch="";; esac
if [[ -z "$TAG" && "$BRANCH_EXPLICIT" == 0 ]]; then
  BRANCH="${saved_channel:-${checkout_branch:-main}}"
fi
channel_display="${saved_channel:-${checkout_branch:-main}}"

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
Channel   : $channel_display
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
  VERSION INSTALL.sh INSTALL-core.sh UPDATE.sh UPDATE-core.sh UNINSTALL.sh
  GITHUB-UPDATE.sh GITHUB-UPDATE-core.sh MIGRATE-TO-GITHUB.sh MIGRATE-TO-GITHUB-core.sh
  bin/ywd-hotspotctl bin/ywd-hotspotctl-core bin/ywd-ui.sh lab/mmdvm-diag.sh
  lib/dashboard.py lib/dashboard_core.py lib/dashboard_update.py lib/admin.py lib/update_admin.py lib/update_runner.py
  lib/build_info.py lib/generate-config.py lib/migrate.py lib/config_model.py lib/oled.py lib/oled_owner.sh
  web/index.html web/app.js web/app-core.js web/talkgroups.js web/ui-polish.js web/ui-polish.css web/style.css
  web/update.js web/update.css web/update-progress.js
  web/instrumentation.js web/instrumentation-bootstrap.js web/instrumentation.css
  sudoers/ywd-hotspot systemd/ywd-mmdvmhost.service systemd/ywd-dmrgateway.service
  systemd/ywd-dashboard.service systemd/ywd-activity.service systemd/ywd-oled.service systemd/ywd-update.service
  assets/branding/ywd-hotspot-badge-256.webp
)
plugin_target=0
if [[ -z "$TAG" && "$BRANCH" == "dev-plugins" ]]; then
  plugin_target=1
  required+=(
    lib/dashboard_plugins.py lib/plugin_admin.py lib/admin_dispatch.sh lib/plugin_manager.py
    lib/plugin_packages/system-info/plugin.json lib/plugin_packages/system-info/config.schema.json
    web/plugin-manager.js web/plugin-manager.css
  )
fi
for f in "${required[@]}"; do
  [[ -e "$stage/$f" ]] || { echo "[FAIL] Candidate is missing required file: $f"; exit 1; }
done

for f in UPDATE.sh UPDATE-core.sh INSTALL.sh INSTALL-core.sh GITHUB-UPDATE.sh GITHUB-UPDATE-core.sh MIGRATE-TO-GITHUB.sh MIGRATE-TO-GITHUB-core.sh UNINSTALL.sh bin/ywd-hotspotctl bin/ywd-hotspotctl-core bin/ywd-ui.sh lab/mmdvm-diag.sh lib/oled_owner.sh; do
  [[ -f "$stage/$f" ]] && bash -n "$stage/$f"
done
if (( plugin_target )); then
  bash -n "$stage/lib/admin_dispatch.sh"
fi
python3 -m py_compile "$stage"/lib/*.py
if (( plugin_target )); then
  PYTHONPATH="$stage/lib" \
  YWD_PLUGIN_CATALOG="$stage/lib/plugin_packages" \
  YWD_PLUGIN_STATE="$stage/.plugin-state-does-not-exist" \
  YWD_PLUGIN_CONFIG_DIR="$stage/.plugin-config-does-not-exist" \
  python3 - <<'PY'
import plugin_manager
snapshot = plugin_manager.snapshot({"hostname":"candidate","uptime_s":1,"temperature_c":25,"load":[0,0,0]})
assert snapshot["api"] == 1
rows = [p for p in snapshot["plugins"] if p.get("id") == "system-info"]
assert len(rows) == 1 and rows[0].get("valid") is True, rows
assert snapshot["system"].get("enabled") is False
PY
fi

echo "Candidate validation: OK"
if [[ "$MODE" == "dry-run" ]]; then
  echo "Dry run complete. The live installation and service state were not changed."
  exit 0
fi

echo
read -r -p "Apply $target_version from $label @ $target_short? [y/N]: " answer
[[ "$answer" =~ ^[Yy]$ ]] || { echo "Cancelled."; exit 0; }

echo "Applying validated candidate. UPDATE.sh will preserve the current RF/service policy..."
next_channel="$channel_display"
[[ -z "$TAG" ]] && next_channel="$BRANCH"
YWD_SOURCE_TYPE=github \
YWD_SOURCE_STATE=clean \
YWD_GIT_BRANCH="$label" \
YWD_GIT_COMMIT="$target_sha" \
YWD_GIT_COMMIT_DATE="$target_date" \
YWD_UPDATE_CHANNEL="$next_channel" \
  bash "$stage/UPDATE.sh"

if [[ -n "$TAG" ]]; then
  git -C "$REPO_DIR" checkout --quiet --detach "$target_sha"
else
  git -C "$REPO_DIR" checkout --quiet -B "$BRANCH" "$target_sha"
  git -C "$REPO_DIR" branch --set-upstream-to="origin/$BRANCH" "$BRANCH" >/dev/null 2>&1 || true
  if [[ "$BRANCH" == "main" || "$BRANCH" == "dev" || "$BRANCH" == "dev-plugins" ]]; then
    tmp_channel="${CHANNEL_FILE}.tmp"
    printf '%s\n' "$BRANCH" > "$tmp_channel"
    chmod 0644 "$tmp_channel"
    chown root:root "$tmp_channel" 2>/dev/null || true
    mv -f "$tmp_channel" "$CHANNEL_FILE"
    channel_display="$BRANCH"
  fi
fi

echo
echo "GitHub source checkout updated successfully."
echo "Update channel: $channel_display"
/usr/local/sbin/ywd-hotspotctl source 2>/dev/null || true
