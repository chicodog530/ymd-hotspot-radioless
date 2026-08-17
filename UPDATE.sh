#!/usr/bin/env bash
set -euo pipefail
SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -r "$SELF/bin/ywd-ui.sh" ]] && source "$SELF/bin/ywd-ui.sh"
VERSION="$(cat "$SELF/VERSION" 2>/dev/null || echo unknown)"
if declare -F ywd_banner >/dev/null; then
  ywd_banner "APPLIANCE UPDATE" "$VERSION"
  ywd_info "Configuration, credentials and calibration data are preserved."
  ywd_info "MMDVM-Host / DMRGateway are not recompiled by normal app updates."
fi

# Nested console/update/display helpers are installed after the core updater
# returns, so validate them before any live service/config work begins.
if [[ -d "$SELF/lib/console" ]]; then
  python3 -m py_compile "$SELF/lib/console/ywd-system-info.py"
  for f in ywd-info-wrapper.sh ywd-logs.sh ywd-env.sh ywd-prompt.sh ywd-motd.sh; do
    bash -n "$SELF/lib/console/$f"
  done
fi
for f in \
  lib/update_runner.py lib/update_admin.py lib/dashboard_update.py lib/oled.py lib/oled_owner.sh \
  lib/plugin_manager.py lib/plugin_service_manager.py lib/plugin_admin.py lib/dashboard_plugins.py \
  lib/service_plugin_packages/service-heartbeat/plugin.json \
  lib/service_plugin_packages/service-heartbeat/config.schema.json \
  lib/service_plugin_packages/service-heartbeat/service.py \
  web/update.js web/update.css web/update-progress.js \
  web/instrumentation.js web/instrumentation-bootstrap.js web/instrumentation.css \
  web/plugin-manager.js web/plugin-manager.css \
  systemd/ywd-update.service systemd/ywd-plugin@.service; do
  [[ -f "$SELF/$f" ]] || { echo "[FAIL] Update source missing $f" >&2; exit 1; }
done
python3 -m py_compile \
  "$SELF/lib/update_runner.py" "$SELF/lib/update_admin.py" "$SELF/lib/dashboard_update.py" "$SELF/lib/oled.py" \
  "$SELF/lib/plugin_manager.py" "$SELF/lib/plugin_service_manager.py" "$SELF/lib/plugin_admin.py" "$SELF/lib/dashboard_plugins.py" \
  "$SELF/lib/service_plugin_packages/service-heartbeat/service.py"
bash -n "$SELF/lib/oled_owner.sh"
[[ -f "$SELF/lib/system_branding.sh" ]] && bash -n "$SELF/lib/system_branding.sh"

# Validate both plugin catalogs with missing state/config paths. Missing state
# must remain fail-closed and neither catalog is allowed to execute plugin code
# during discovery.
PYTHONPATH="$SELF/lib" \
YWD_PLUGIN_CATALOG="$SELF/lib/plugin_packages" \
YWD_SERVICE_PLUGIN_CATALOG="$SELF/lib/service_plugin_packages" \
YWD_PLUGIN_STATE="$SELF/.plugin-state-does-not-exist" \
YWD_PLUGIN_CONFIG_DIR="$SELF/.plugin-config-does-not-exist" \
python3 - <<'PY'
import plugin_manager, plugin_service_manager
base = plugin_manager.snapshot({"hostname":"candidate","uptime_s":1,"temperature_c":25,"load":[0,0,0]})
assert base["system"]["enabled"] is False
assert any(p.get("id") == "system-info" and p.get("valid") for p in base["plugins"])
services = plugin_service_manager.snapshot()
assert any(p.get("id") == "service-heartbeat" and p.get("valid") for p in services), services
assert all(not p.get("rf_mode") for p in services)
PY

CORE="$SELF/UPDATE-core.sh"
[[ -f "$CORE" ]] || CORE="/opt/ywd-hotspot/repo/UPDATE-core.sh"
[[ -f "$CORE" ]] || { echo "[FAIL] Updater core not found." >&2; exit 1; }

# YWD-Hotspot OS already has one authoritative OLED owner. Ensure the legacy
# app unit is off before the core updater captures service state so it cannot be
# restarted alongside ywd-headless-oled during this transition.
if sudo systemctl cat ywd-headless-oled.service >/dev/null 2>&1; then
  sudo systemctl disable --now ywd-oled.service >/dev/null 2>&1 || true
fi

if declare -F ywd_run_colored >/dev/null; then
  ywd_run_colored bash "$CORE" "$@"
else
  bash "$CORE" "$@"
fi

# Persist first-party update channels from the invoking GitHub updater. This is
# intentionally done by the incoming candidate so an older main/dev-only updater
# can bootstrap an appliance onto dev-plugins in one explicit branch update.
case "${YWD_UPDATE_CHANNEL:-}" in
  main|dev|dev-plugins)
    printf '%s\n' "$YWD_UPDATE_CHANNEL" | sudo tee /etc/ywd-hotspot/update-channel.tmp >/dev/null
    sudo chmod 0644 /etc/ywd-hotspot/update-channel.tmp
    sudo chown root:root /etc/ywd-hotspot/update-channel.tmp 2>/dev/null || true
    sudo mv -f /etc/ywd-hotspot/update-channel.tmp /etc/ywd-hotspot/update-channel
    ;;
esac

if [[ -f "$SELF/lib/admin_dispatch.sh" && -f "$SELF/lib/setup_admin.py" ]]; then
  sudo install -o root -g root -m 0755 "$SELF/lib/admin.py" /usr/local/libexec/ywd-hotspot-admin-core
  sudo install -o root -g root -m 0755 "$SELF/lib/setup_admin.py" /usr/local/libexec/ywd-hotspot-setup-admin
  sudo install -o root -g root -m 0755 "$SELF/lib/update_admin.py" /usr/local/libexec/ywd-hotspot-update-admin
  sudo install -o root -g root -m 0755 "$SELF/lib/update_runner.py" /usr/local/libexec/ywd-update-runner
  sudo install -o root -g root -m 0755 "$SELF/lib/admin_dispatch.sh" /usr/local/libexec/ywd-hotspot-admin
  [[ -f "$SELF/lib/setup_entry.sh" ]] && sudo chmod 0755 "$SELF/lib/setup_entry.sh"
  sudo chmod 0755 "$SELF/lib/admin_dispatch.sh" "$SELF/lib/setup_admin.py" "$SELF/lib/update_admin.py" "$SELF/lib/update_runner.py"
  if command -v visudo >/dev/null 2>&1 && [[ -f /etc/sudoers.d/ywd-hotspot ]]; then
    sudo visudo -cf /etc/sudoers.d/ywd-hotspot >/dev/null
  fi
  sudo systemctl daemon-reload
fi

if [[ -f "$SELF/lib/system_branding.sh" ]]; then
  sudo bash "$SELF/lib/system_branding.sh" install "$SELF"
fi

# Point the sole OS OLED owner at the unified renderer. Generic installs have
# no headless unit, so this helper is a no-op there.
if [[ -f "$SELF/lib/oled_owner.sh" ]]; then
  sudo bash "$SELF/lib/oled_owner.sh" install "$SELF"
fi
