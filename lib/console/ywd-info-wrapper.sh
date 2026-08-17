#!/usr/bin/env bash
set -euo pipefail
HELPER=/usr/local/libexec/ywd-system-info
MODE="$(basename "$0")"
ARGS=("$@")
case "$MODE" in
  ywd-services) ARGS=(--services "${ARGS[@]}") ;;
  ywd-build) ARGS=(--build "${ARGS[@]}") ;;
esac

if [[ "$(id -u)" -eq 0 || -r /etc/ywd-hotspot/config.json ]]; then
  exec "$HELPER" "${ARGS[@]}"
fi

# YWD-Hotspot OS normally permits non-interactive sudo for the administrative
# user. Try the narrow read-only helper without ever prompting during login.
if out="$(sudo -n "$HELPER" "${ARGS[@]}" 2>/dev/null)"; then
  printf '%s\n' "$out"
  exit 0
fi

# Generic installs may require an interactive sudo password. Never prompt from
# MOTD/login hooks; print a useful public-only summary instead.
exec "$HELPER" --public-fallback "${ARGS[@]}"
