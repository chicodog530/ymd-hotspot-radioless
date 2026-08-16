#!/usr/bin/env bash
set -euo pipefail
umask 027
SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ $EUID -ne 0 ]]; then exec sudo "$0" "$@"; fi
VERSION="$(cat "$SELF/VERSION")"

echo "============================================================"
echo " YWD-Hotspot update -> $VERSION"
echo " Calibration Prep + UI Polish"
echo "============================================================"
echo "This updater does NOT recompile MMDVM-Host or DMRGateway."
echo "It preserves whether RF was running/enabled before the update."

if ! id ywd-hotspot >/dev/null 2>&1; then
  echo "[FAIL] Existing YWD-Hotspot service account not found. Use INSTALL.sh."
  exit 1
fi
if [[ ! -f /etc/ywd-hotspot/config.json ]]; then
  echo "[FAIL] Existing /etc/ywd-hotspot/config.json not found. Use INSTALL.sh."
  exit 1
fi

# Capture the current appliance state before replacing units/scripts.
mmdvm_active=0; gateway_active=0; dashboard_active=0; oled_active=0
mmdvm_enabled=0; gateway_enabled=0; dashboard_enabled=0; oled_enabled=0
systemctl is-active --quiet ywd-mmdvmhost.service 2>/dev/null && mmdvm_active=1 || true
systemctl is-active --quiet ywd-dmrgateway.service 2>/dev/null && gateway_active=1 || true
systemctl is-active --quiet ywd-dashboard.service 2>/dev/null && dashboard_active=1 || true
systemctl is-active --quiet ywd-oled.service 2>/dev/null && oled_active=1 || true
systemctl is-enabled --quiet ywd-mmdvmhost.service 2>/dev/null && mmdvm_enabled=1 || true
systemctl is-enabled --quiet ywd-dmrgateway.service 2>/dev/null && gateway_enabled=1 || true
systemctl is-enabled --quiet ywd-dashboard.service 2>/dev/null && dashboard_enabled=1 || true
systemctl is-enabled --quiet ywd-oled.service 2>/dev/null && oled_enabled=1 || true

mkdir -p /var/backups/ywd-hotspot
stamp="$(date +%Y%m%d-%H%M%S)"
backup="/var/backups/ywd-hotspot/pre-alpha5-$stamp.tar.gz"
tar -czf "$backup" /etc/ywd-hotspot 2>/dev/null
chmod 600 "$backup"
echo "Protected pre-update config backup: $backup"

echo "Installing Alpha5 runtime files..."
for g in dialout i2c systemd-journal; do
  getent group "$g" >/dev/null 2>&1 && usermod -a -G "$g" ywd-hotspot || true
done
install -d -m 0755 /opt/ywd-hotspot/app /usr/local/libexec
install -d -o root -g ywd-hotspot -m 0750 /etc/ywd-hotspot
install -d -o ywd-hotspot -g ywd-hotspot -m 0750 /var/lib/ywd-hotspot /var/lib/ywd-hotspot/diagnostics
install -d -o root -g root -m 0700 /var/lib/ywd-hotspot/private /var/lib/ywd-hotspot/private/config-history
rm -rf /opt/ywd-hotspot/app/*
cp -a "$SELF/." /opt/ywd-hotspot/app/
chmod +x /opt/ywd-hotspot/app/bin/ywd-hotspotctl /opt/ywd-hotspot/app/lib/*.py /opt/ywd-hotspot/app/lab/mmdvm-diag.sh
install -m 0755 /opt/ywd-hotspot/app/bin/ywd-hotspotctl /usr/local/sbin/ywd-hotspotctl
install -o root -g root -m 0755 /opt/ywd-hotspot/app/lib/admin.py /usr/local/libexec/ywd-hotspot-admin
install -o root -g root -m 0440 "$SELF/sudoers/ywd-hotspot" /etc/sudoers.d/ywd-hotspot
if command -v visudo >/dev/null 2>&1; then visudo -cf /etc/sudoers.d/ywd-hotspot >/dev/null; fi
for unit in "$SELF"/systemd/*.service "$SELF"/systemd/*.timer; do
  [[ -e "$unit" ]] || continue
  install -m 0644 "$unit" "/etc/systemd/system/$(basename "$unit")"
done
systemctl daemon-reload

# Migrate Alpha2/Alpha3 schema to schema 3, then preserve the real pre-update
# systemd boot policy as the canonical rf_autostart setting.
python3 /opt/ywd-hotspot/app/lib/migrate.py
RF_ENABLED=$(( mmdvm_enabled && gateway_enabled )) python3 - <<'PY'
import json, os
from pathlib import Path
p=Path('/etc/ywd-hotspot/config.json'); c=json.loads(p.read_text())
c.setdefault('maintenance',{})['rf_autostart']=bool(int(os.environ.get('RF_ENABLED','0')))
t=p.with_suffix('.policy.tmp'); t.write_text(json.dumps(c,indent=2)+'\n'); os.chmod(t,0o640)
try:
 import grp; os.chown(t,0,grp.getgrnam('ywd-hotspot').gr_gid)
except Exception: pass
os.replace(t,p)
PY
python3 /opt/ywd-hotspot/app/lib/generate-config.py

# Keep persistent crash evidence enabled when configured.
read -r JOURNAL_ENABLED JOURNAL_MB < <(python3 - <<'PY'
import json
c=json.load(open('/etc/ywd-hotspot/config.json')); m=c.get('maintenance',{})
print(1 if m.get('persistent_journal',True) else 0, int(m.get('journal_max_mb',100)))
PY
)
if [[ "$JOURNAL_ENABLED" == "1" ]]; then
  install -d -m 0755 /var/log/journal /etc/systemd/journald.conf.d
  cat > /etc/systemd/journald.conf.d/10-ywd-hotspot-persistent.conf <<EOF
[Journal]
Storage=persistent
SystemMaxUse=${JOURNAL_MB}M
RuntimeMaxUse=50M
EOF
else
  install -d -m 0755 /etc/systemd/journald.conf.d
  cat > /etc/systemd/journald.conf.d/10-ywd-hotspot-persistent.conf <<'EOF'
[Journal]
Storage=volatile
RuntimeMaxUse=50M
EOF
fi
systemctl restart systemd-journald.service || true

# Mark the freshly generated configuration as the applied baseline.
printf '{}\n' | /usr/local/libexec/ywd-hotspot-admin init-applied >/dev/null

# ID updater is now a cheap 6-hour due-check; do not download if the local file
# is still inside the configured age interval.
python3 /opt/ywd-hotspot/app/lib/id-update.py || echo "[WARN] RadioID due-check/update failed; existing database retained."
systemctl enable --now ywd-activity.service ywd-dmrid-update.timer

# Preserve dashboard/OLED policy from Alpha3 rather than unexpectedly enabling
# a service the operator had disabled.
if (( dashboard_enabled || dashboard_active )); then systemctl enable ywd-dashboard.service >/dev/null 2>&1 || true; fi
if (( oled_enabled || oled_active )); then systemctl enable ywd-oled.service >/dev/null 2>&1 || true; fi

# Apply new units without ever starting an RF path that was previously stopped.
if (( gateway_active )); then systemctl stop ywd-dmrgateway.service || true; fi
if (( mmdvm_active )); then systemctl restart ywd-mmdvmhost.service; fi
if (( gateway_active )); then sleep 2; systemctl start ywd-dmrgateway.service; fi
if (( dashboard_active )); then systemctl restart ywd-dashboard.service; fi
if (( oled_active )); then systemctl restart ywd-oled.service || true; fi

# Restore pre-update enable/disable state exactly for RF.
if (( mmdvm_enabled )); then systemctl enable ywd-mmdvmhost.service >/dev/null 2>&1; else systemctl disable ywd-mmdvmhost.service >/dev/null 2>&1 || true; fi
if (( gateway_enabled )); then systemctl enable ywd-dmrgateway.service >/dev/null 2>&1; else systemctl disable ywd-dmrgateway.service >/dev/null 2>&1 || true; fi

sleep 2
echo
echo "Updated to $VERSION."
echo "Alpha5 UI/location/calibration-prep features are available after refreshing the dashboard."
echo "Persistent journal: $([[ "$JOURNAL_ENABLED" == 1 ]] && echo enabled || echo disabled)"
echo
ywd-hotspotctl status || true
