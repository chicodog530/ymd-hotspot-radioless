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
CORE="$SELF/UPDATE-core.sh"
[[ -f "$CORE" ]] || CORE="/opt/ywd-hotspot/repo/UPDATE-core.sh"
[[ -f "$CORE" ]] || { echo "[FAIL] Updater core not found." >&2; exit 1; }
if declare -F ywd_run_colored >/dev/null; then ywd_run_colored bash "$CORE" "$@"; else exec bash "$CORE" "$@"; fi
