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
CORE="$SELF/INSTALL-core.sh"
[[ -f "$CORE" ]] || CORE="/opt/ywd-hotspot/repo/INSTALL-core.sh"
[[ -f "$CORE" ]] || { echo "[FAIL] Installer core not found." >&2; exit 1; }
if declare -F ywd_run_colored >/dev/null; then ywd_run_colored bash "$CORE" "$@"; else exec bash "$CORE" "$@"; fi
