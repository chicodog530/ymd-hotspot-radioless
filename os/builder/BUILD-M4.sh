#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
printf '[INFO] BUILD-M4.sh is a compatibility alias. Using the unified current-source builder.\n'
exec bash "$SCRIPT_DIR/BUILD.sh" "$@"
