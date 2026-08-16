#!/usr/bin/env bash
set -euo pipefail
SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -r "$SELF/bin/ywd-ui.sh" ]] && source "$SELF/bin/ywd-ui.sh"
VERSION="$(cat "$SELF/VERSION" 2>/dev/null || cat /opt/ywd-hotspot/app/VERSION 2>/dev/null || echo unknown)"
if declare -F ywd_banner >/dev/null; then
  ywd_banner "GITHUB UPDATE" "$VERSION"
  ywd_info "Fetch + validation happen before the live RF stack is touched."
fi
CORE="$SELF/GITHUB-UPDATE-core.sh"
[[ -f "$CORE" ]] || CORE="/opt/ywd-hotspot/repo/GITHUB-UPDATE-core.sh"
[[ -f "$CORE" ]] || { echo "[FAIL] GitHub updater core not found." >&2; exit 1; }
if declare -F ywd_run_colored >/dev/null; then ywd_run_colored bash "$CORE" "$@"; else exec bash "$CORE" "$@"; fi
