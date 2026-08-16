# Upgrading YWD-Hotspot

YWD-Hotspot updates are designed around one rule: **an update must not unexpectedly enable RF**.

For `0.1.0-alpha5`, `UPDATE.sh` does not rebuild the pinned MMDVM-Host or DMRGateway binaries and preserves the active/enabled RF service state that existed before the update.

## Before updating

Check the current state:

```bash
ywd-hotspotctl status
```

Create a protected configuration backup:

```bash
sudo ywd-hotspotctl backup
```

The backup is written below `/var/backups/ywd-hotspot/` with mode `0600` and **contains credentials**. Do not upload it to GitHub, a public issue, or a diagnostic paste.

If you intentionally keep RF stopped, confirm it before updating:

```bash
systemctl is-active ywd-mmdvmhost.service || true
systemctl is-active ywd-dmrgateway.service || true
systemctl is-enabled ywd-mmdvmhost.service || true
systemctl is-enabled ywd-dmrgateway.service || true
```

## Updating a Git checkout

```bash
cd ~/ywd-hotspot
git status --short
git pull --ff-only
chmod +x INSTALL.sh UPDATE.sh UNINSTALL.sh bin/ywd-hotspotctl lab/mmdvm-diag.sh lib/*.py
sudo ./UPDATE.sh
```

If `git status --short` shows local source modifications, do not blindly overwrite them. Commit/stash them or use a clean checkout first.

## What Alpha5 UPDATE.sh does

The updater:

- records which core/UI services are active and enabled
- creates a protected pre-update archive of `/etc/ywd-hotspot`
- replaces the YWD-Hotspot application files
- reinstalls the CLI/admin helper/sudoers policy/systemd units
- migrates older config schemas to schema 3
- regenerates MMDVM-Host/DMRGateway INI files
- preserves the real pre-update RF boot policy
- preserves persistent-journal settings
- refreshes DMR IDs only when due
- restarts only services that were already running where appropriate
- restores the exact RF enabled/disabled boot state

It explicitly does **not** compile MMDVM-Host or DMRGateway.

## After updating

```bash
ywd-hotspotctl status
ywd-hotspotctl health
```

Hard-refresh the dashboard if browser assets appear stale.

If the RF path was stopped before the update, it should still be stopped afterward. If it was active, verify BrandMeister connectivity and perform a normal test transmission.

## Rollback/config history

Alpha4+ configuration changes are transactional and retain rollback history. Normal config history is separate from the dedicated calibration baseline.

Useful commands:

```bash
ywd-hotspotctl history
sudo ywd-hotspotctl diagnostics
```

The web UI also exposes configuration history/rollback controls.

## Updating pinned upstream radio components

Do not change `pins.env` during calibration/stability work merely because newer upstream commits exist. Moving an RF-stack pin changes the test baseline and should be treated as its own deliberate development change with a fresh build and regression test.
