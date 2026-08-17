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

# Nested console helpers are installed after the core updater returns, so check
# them here before any live service/config work begins.
if [[ -d "$SELF/lib/console" ]]; then
  python3 -m py_compile "$SELF/lib/console/ywd-system-info.py"
  for f in ywd-info-wrapper.sh ywd-logs.sh ywd-env.sh ywd-prompt.sh ywd-motd.sh; do
    bash -n "$SELF/lib/console/$f"
  done
fi
[[ -f "$SELF/lib/system_branding.sh" ]] && bash -n "$SELF/lib/system_branding.sh"

CORE="$SELF/UPDATE-core.sh"
[[ -f "$CORE" ]] || CORE="/opt/ywd-hotspot/repo/UPDATE-core.sh"
[[ -f "$CORE" ]] || { echo "[FAIL] Updater core not found." >&2; exit 1; }

# Run the established updater first. On M4 OS images the core temporarily
# installs admin.py at ywd-hotspot-admin while it performs its normal migration
# and init-applied work. After a successful update, restore the tested M4
# dispatcher layout so setup-finish remains isolated behind its dedicated
# privileged helper. Generic installs without the M4 setup payload are unchanged.
if declare -F ywd_run_colored >/dev/null; then
  ywd_run_colored bash "$CORE" "$@"
else
  bash "$CORE" "$@"
fi

if [[ -f "$SELF/lib/admin_dispatch.sh" && -f "$SELF/lib/setup_admin.py" ]]; then
  sudo install -o root -g root -m 0755 "$SELF/lib/admin.py" /usr/local/libexec/ywd-hotspot-admin-core
  sudo install -o root -g root -m 0755 "$SELF/lib/setup_admin.py" /usr/local/libexec/ywd-hotspot-setup-admin
  sudo install -o root -g root -m 0755 "$SELF/lib/admin_dispatch.sh" /usr/local/libexec/ywd-hotspot-admin
  [[ -f "$SELF/lib/setup_entry.sh" ]] && sudo chmod 0755 "$SELF/lib/setup_entry.sh"
  sudo chmod 0755 "$SELF/lib/admin_dispatch.sh" "$SELF/lib/setup_admin.py"
  if command -v visudo >/dev/null 2>&1 && [[ -f /etc/sudoers.d/ywd-hotspot ]]; then
    sudo visudo -cf /etc/sudoers.d/ywd-hotspot >/dev/null
  fi
fi

# Apply the same console/login identity used by YWD-Hotspot OS images. The
# helper records the host's previous issue/MOTD state so uninstall can restore it.
if [[ -f "$SELF/lib/system_branding.sh" ]]; then
  sudo bash "$SELF/lib/system_branding.sh" install "$SELF"
fi
