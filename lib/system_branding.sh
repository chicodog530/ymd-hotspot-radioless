#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-install}"
SOURCE_ROOT="${2:-/opt/ywd-hotspot/app}"
STATE_DIR="/var/lib/ywd-hotspot/private/system-branding"
EXEC_LIST="$STATE_DIR/update-motd-exec.list"

need_root() {
  if [[ $EUID -ne 0 ]]; then
    exec sudo bash "$0" "$MODE" "$SOURCE_ROOT"
  fi
}

save_originals_once() {
  install -d -o root -g root -m 0700 "$STATE_DIR"
  if [[ ! -f "$STATE_DIR/saved" ]]; then
    for name in issue issue.net motd; do
      if [[ -e "/etc/$name" ]]; then
        cp -a "/etc/$name" "$STATE_DIR/$name.original"
      fi
    done
    : > "$EXEC_LIST"
    if [[ -d /etc/update-motd.d ]]; then
      for f in /etc/update-motd.d/*; do
        [[ -f "$f" && -x "$f" ]] || continue
        basename "$f" >> "$EXEC_LIST"
      done
    fi
    chmod 0600 "$EXEC_LIST"
    printf '%s\n' "saved" > "$STATE_DIR/saved"
    chmod 0600 "$STATE_DIR/saved"
  fi
}

install_branding() {
  [[ -f "$SOURCE_ROOT/etc/issue" ]] || { echo "[FAIL] Missing $SOURCE_ROOT/etc/issue" >&2; exit 1; }
  [[ -f "$SOURCE_ROOT/etc/motd" ]] || { echo "[FAIL] Missing $SOURCE_ROOT/etc/motd" >&2; exit 1; }
  save_originals_once

  install -o root -g root -m 0644 "$SOURCE_ROOT/etc/issue" /etc/issue
  install -o root -g root -m 0644 "$SOURCE_ROOT/etc/issue" /etc/issue.net
  install -o root -g root -m 0644 "$SOURCE_ROOT/etc/motd" /etc/motd

  # Suppress distro-generated MOTD fragments so SSH/local logins show the YWD
  # appliance identity instead of a second Debian/Raspberry Pi banner. Original
  # executable state is recorded above and restored by uninstall/restore mode.
  if [[ -d /etc/update-motd.d ]]; then
    find /etc/update-motd.d -maxdepth 1 -type f -exec chmod -x {} + 2>/dev/null || true
  fi
  : > /run/motd.dynamic 2>/dev/null || true
}

restore_branding() {
  [[ -d "$STATE_DIR" ]] || return 0
  for name in issue issue.net motd; do
    if [[ -e "$STATE_DIR/$name.original" ]]; then
      cp -a "$STATE_DIR/$name.original" "/etc/$name"
    fi
  done

  if [[ -d /etc/update-motd.d ]]; then
    find /etc/update-motd.d -maxdepth 1 -type f -exec chmod -x {} + 2>/dev/null || true
    if [[ -f "$EXEC_LIST" ]]; then
      while IFS= read -r name; do
        [[ -n "$name" && -f "/etc/update-motd.d/$name" ]] || continue
        chmod +x "/etc/update-motd.d/$name"
      done < "$EXEC_LIST"
    fi
    if command -v run-parts >/dev/null 2>&1; then
      run-parts /etc/update-motd.d > /run/motd.dynamic 2>/dev/null || true
    fi
  fi
}

need_root
case "$MODE" in
  install) install_branding ;;
  restore) restore_branding ;;
  *) echo "usage: system_branding.sh [install|restore] [source-root]" >&2; exit 2 ;;
esac
