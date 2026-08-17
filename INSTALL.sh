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
[[ -f "$SELF/lib/system_branding.sh" ]] && bash -n "$SELF/lib/system_branding.sh"

CORE="$SELF/INSTALL-core.sh"
[[ -f "$CORE" ]] || CORE="/opt/ywd-hotspot/repo/INSTALL-core.sh"
[[ -f "$CORE" ]] || { echo "[FAIL] Installer core not found." >&2; exit 1; }
if declare -F ywd_run_colored >/dev/null; then
  ywd_run_colored bash "$CORE" "$@"
else
  bash "$CORE" "$@"
fi

# Give both fresh installs and GitHub-adopted installs the same YWD console
# identity as the custom OS image, while preserving the host defaults for undo.
if [[ -f "$SELF/lib/system_branding.sh" ]]; then
  sudo bash "$SELF/lib/system_branding.sh" install "$SELF"
fi
