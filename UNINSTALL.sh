#!/usr/bin/env bash
set -euo pipefail
if [[ $EUID -ne 0 ]]; then exec sudo "$0" "$@"; fi
echo "This removes YWD-Hotspot services/binaries but keeps configuration/history by default."
read -r -p "Type REMOVE to continue: " a
[[ "$a" == REMOVE ]] || exit 0
systemctl disable --now ywd-dmrgateway.service ywd-mmdvmhost.service ywd-dashboard.service ywd-activity.service ywd-oled.service ywd-dmrid-update.timer 2>/dev/null || true
rm -f /etc/systemd/system/ywd-{dmrgateway,mmdvmhost,dashboard,activity,oled,dmrid-update}.service /etc/systemd/system/ywd-dmrid-update.timer
rm -f /etc/sudoers.d/ywd-hotspot /usr/local/libexec/ywd-hotspot-admin /usr/local/bin/MMDVM-Host /usr/local/bin/DMRGateway /usr/local/sbin/ywd-hotspotctl
rm -f /etc/systemd/journald.conf.d/10-ywd-hotspot-persistent.conf

# Restore the host's pre-YWD console/MOTD files and dynamic MOTD executable
# state before removing the deployed application tree.
if [[ -f /opt/ywd-hotspot/app/lib/system_branding.sh ]]; then
  bash /opt/ywd-hotspot/app/lib/system_branding.sh restore /opt/ywd-hotspot/app || true
fi

systemctl daemon-reload
systemctl restart systemd-journald.service 2>/dev/null || true
rm -rf /opt/ywd-hotspot
echo "Removed YWD-Hotspot application/services."
echo "Kept /etc/ywd-hotspot and /var/lib/ywd-hotspot. Remove them manually only if you intend to erase credentials/history."
