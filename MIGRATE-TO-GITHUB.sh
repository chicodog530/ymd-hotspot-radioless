#!/usr/bin/env bash
set -euo pipefail
SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -r "$SELF/bin/ywd-ui.sh" ]] && source "$SELF/bin/ywd-ui.sh"
VERSION="$(cat "$SELF/VERSION" 2>/dev/null || echo unknown)"
if declare -F ywd_banner >/dev/null; then
  ywd_banner "GITHUB ADOPTION" "$VERSION"
  ywd_info "Adopts an existing appliance without rebuilding the RF core."
fi
CORE="$SELF/MIGRATE-TO-GITHUB-core.sh"
[[ -f "$CORE" ]] || CORE="/opt/ywd-hotspot/repo/MIGRATE-TO-GITHUB-core.sh"
[[ -f "$CORE" ]] || { echo "[FAIL] Migration core not found." >&2; exit 1; }
if declare -F ywd_run_colored >/dev/null; then ywd_run_colored bash "$CORE" "$@"; else exec bash "$CORE" "$@"; fi
