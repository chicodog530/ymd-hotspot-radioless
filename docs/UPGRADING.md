# Upgrading YWD-Hotspot

The update invariant is simple: **an update must not unexpectedly enable RF**.

`0.1.0-alpha6` adds a GitHub-managed source checkout and a staged/validated update path. Normal application updates still do **not** rebuild the pinned MMDVM-Host or DMRGateway binaries.

## Managed layout

```text
/opt/ywd-hotspot/repo    root-owned Git source checkout
/opt/ywd-hotspot/app     deployed runtime copy
/etc/ywd-hotspot         canonical config + build provenance
/var/backups/ywd-hotspot protected pre-update backups
```

The live runtime is deliberately separate from `.git`. A failed fetch or dirty checkout therefore does not affect RF operation.

## Moving an older archive install to GitHub

Clone the canonical repository:

```bash
cd ~
git clone https://github.com/merberg-ai/ywd-hotspot.git
cd ywd-hotspot
chmod +x INSTALL.sh UPDATE.sh UNINSTALL.sh GITHUB-UPDATE.sh MIGRATE-TO-GITHUB.sh
chmod +x bin/ywd-hotspotctl lab/mmdvm-diag.sh lib/*.py
```

Then either run:

```bash
sudo ./INSTALL.sh
```

and choose **Adopt existing installation and switch to GitHub updates**, or directly run:

```bash
sudo ./MIGRATE-TO-GITHUB.sh
```

Migration preserves configuration, credentials, calibration/history data and current RF active/enabled state. It does not rebuild MMDVM-Host or DMRGateway.

## Check for updates

```bash
sudo ywd-hotspotctl update --check
```

This fetches Git metadata and compares the installed build information to the requested GitHub ref. It does not restart or stop services.

Example output is similar to:

```text
Installed : 0.1.0-alpha6
Commit    : 1234567890
Target    : 0.1.0-alpha6
Source    : main @ abcdef1234
Status    : update available
```

## Validate without applying

```bash
sudo ywd-hotspotctl update --dry-run
```

The updater:

- fetches the canonical repository
- resolves the requested branch/tag
- stages the candidate outside the live app
- checks required files
- runs `bash -n` on shell entry points
- runs Python bytecode compilation checks
- exits without touching `/opt/ywd-hotspot/app` or service state

## Apply an update

Default branch:

```bash
sudo ywd-hotspotctl update
```

Explicit branch:

```bash
sudo ywd-hotspotctl update --branch main
```

Specific release tag:

```bash
sudo ywd-hotspotctl update --tag v0.1.0-alpha6
```

The command asks for explicit confirmation before applying a candidate.

## What happens during a GitHub update

`GITHUB-UPDATE.sh` performs the network/source phase first while the current hotspot continues running:

1. acquires an update lock
2. verifies `/opt/ywd-hotspot/repo`
3. verifies the origin is the canonical YWD-Hotspot repository
4. refuses a dirty checkout
5. fetches branches/tags
6. resolves the target commit/version
7. stages the commit separately
8. validates the staged source
9. invokes the normal transactional `UPDATE.sh`
10. advances `/opt/ywd-hotspot/repo` only after the live update succeeds

`UPDATE.sh` then:

- records active/enabled service state
- saves protected copies of `/etc/ywd-hotspot` and `/opt/ywd-hotspot/app`
- replaces the deployed YWD application files
- reinstalls CLI/admin/sudoers/systemd units
- migrates/normalizes canonical configuration
- regenerates radio INI files
- writes `/etc/ywd-hotspot/build-info.json`
- preserves RF autostart policy
- restarts only services that were running as appropriate
- restores the exact RF enabled/disabled boot policy

If applying the runtime fails, `UPDATE.sh` attempts to restore the previous application/configuration and service state from the protected pre-update backup.

## RF behavior

The updater never interprets "new code exists" as permission to start RF.

Examples:

- RF stopped + disabled before update -> remains stopped + disabled
- RF running + enabled before update -> update restarts it as required and restores enabled state
- dashboard stopped by operator -> updater does not use that as permission to start RF

Always verify afterward:

```bash
ywd-hotspotctl status
```

## Build/source information

```bash
ywd-hotspotctl source
```

The same information appears in the WebUI header and About page.

Build provenance is stored in the non-secret file:

```text
/etc/ywd-hotspot/build-info.json
```

## Local changes in the managed checkout

Updates intentionally refuse this condition:

```bash
git -C /opt/ywd-hotspot/repo status --short
```

If it shows modifications, investigate them. The updater will not silently destroy local edits.

Application configuration should never be kept as source modifications in `/opt/ywd-hotspot/repo`; runtime configuration belongs under `/etc/ywd-hotspot`.

## Manual UPDATE.sh remains available

A clean source checkout can still be applied manually:

```bash
cd ~/ywd-hotspot
git pull --ff-only
sudo ./UPDATE.sh
```

That path is useful for development/recovery, but normal deployments should use `ywd-hotspotctl update` so fetching, validation and provenance handling are consistent.

## Protected backups

Before replacing the live application, Alpha6 creates a directory like:

```text
/var/backups/ywd-hotspot/pre-0.1.0-alpha6-YYYYMMDD-HHMMSS/
```

It contains protected archives of configuration and the previous deployed application. Configuration archives can contain reusable credentials; keep them private.

Normal configuration-history rollback remains separate from full application-update rollback.

## Updating pinned upstream radio components

Do not change `pins.env` during calibration/stability work merely because newer upstream commits exist. Moving an RF-stack pin changes the calibration/test baseline and should be its own deliberate build/regression-test event.
