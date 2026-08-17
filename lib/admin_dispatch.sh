#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  setup-finish)
    exec /usr/local/libexec/ywd-hotspot-setup-admin "$@"
    ;;
  update-check|update-start|set-hotspot-password)
    exec /usr/local/libexec/ywd-hotspot-update-admin "$@"
    ;;
  *)
    exec /usr/local/libexec/ywd-hotspot-admin-core "$@"
    ;;
esac
