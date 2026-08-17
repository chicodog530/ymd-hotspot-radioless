#!/usr/bin/env bash
set -euo pipefail
SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
[[ -r "$SELF/bin/ywd-ui.sh" ]] && source "$SELF/bin/ywd-ui.sh"
VERSION="$(cat "$SELF/VERSION" 2>/dev/null || echo unknown)"
if declare -F ywd_banner >/dev/null; then
  ywd_banner "INSTALLER" "$VERSION"
  ywd_info "Lightweight Raspberry Pi + MMDVM DMR appliance"
  ywd_info "RF never starts without explicit confirmation."
fi

if [[ -d "$SELF/lib/console" ]]; then
  python3 -m py_compile "$SELF/lib/console/ywd-system-info.py"
  for f in ywd-info-wrapper.sh ywd-logs.sh ywd-env.sh ywd-prompt.sh ywd-motd.sh; do
    bash -n "$SELF/lib/console/$f"
  done
fi
python3 -m py_compile "$SELF/lib/update_runner.py" "$SELF/lib/update_admin.py" "$SELF/lib/oled.py"
[[ -f "$SELF/lib/system_branding.sh" ]] && bash -n "$SELF/lib/system_branding.sh"
[[ -f "$SELF/lib/oled_owner.sh" ]] && bash -n "$SELF/lib/oled_owner.sh"

CORE="$SELF/INSTALL-core.sh"
[[ -f "$CORE" ]] || CORE="/opt/ywd-hotspot/repo/INSTALL-core.sh"
[[ -f "$CORE" ]] || { echo "[FAIL] Installer core not found." >&2; exit 1; }
if declare -F ywd_run_colored >/dev/null; then
  ywd_run_colored bash "$CORE" "$@"
else
  bash "$CORE" "$@"
fi

# Install the same narrow dispatcher/helper layout used by the appliance image.
# Generic installs never activate first-boot setup because they lack the M4 gate.
if [[ -f "$SELF/lib/admin_dispatch.sh" && -f "$SELF/lib/setup_admin.py" ]]; then
  sudo install -o root -g root -m 0755 "$SELF/lib/admin.py" /usr/local/libexec/ywd-hotspot-admin-core
  sudo install -o root -g root -m 0755 "$SELF/lib/setup_admin.py" /usr/local/libexec/ywd-hotspot-setup-admin
  sudo install -o root -g root -m 0755 "$SELF/lib/update_admin.py" /usr/local/libexec/ywd-hotspot-update-admin
  sudo install -o root -g root -m 0755 "$SELF/lib/update_runner.py" /usr/local/libexec/ywd-update-runner
  sudo install -o root -g root -m 0755 "$SELF/lib/admin_dispatch.sh" /usr/local/libexec/ywd-hotspot-admin
  sudo install -o root -g root -m 0440 "$SELF/sudoers/ywd-hotspot" /etc/sudoers.d/ywd-hotspot
  command -v visudo >/dev/null 2>&1 && sudo visudo -cf /etc/sudoers.d/ywd-hotspot >/dev/null
  sudo systemctl daemon-reload
fi

# Give both fresh installs and GitHub-adopted installs the same YWD console
# identity as the custom OS image, while preserving the host defaults for undo.
if [[ -f "$SELF/lib/system_branding.sh" ]]; then
  sudo bash "$SELF/lib/system_branding.sh" install "$SELF"
fi

# On YWD-Hotspot OS, preserve ywd-headless-oled as the only SSD1306 owner while
# using the same renderer as generic installs.  On non-OS installs this is a no-op.
if [[ -f "$SELF/lib/oled_owner.sh" ]]; then
  sudo bash "$SELF/lib/oled_owner.sh" install "$SELF"
fi
