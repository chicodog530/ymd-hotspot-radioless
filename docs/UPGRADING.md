# Upgrading YWD-Hotspot

The update invariant is simple: **an update must not unexpectedly enable RF**.

`0.1.0-alpha6` introduced the GitHub-managed source checkout and staged/validated update path. `0.1.0-alpha7-dev` adds a persistent `main` / `dev` update channel on top of that mechanism. Normal application updates still do **not** rebuild the pinned MMDVM-Host or DMRGateway binaries.

## Managed layout

```text
/opt/ywd-hotspot/repo    root-owned Git source checkout
/opt/ywd-hotspot/app     deployed runtime copy
/etc/ywd-hotspot         canonical config + build provenance
/var/backups/ywd-hotspot protected pre-update backups
```

The live runtime is deliberately separate from `.git`. A failed fetch or dirty checkout therefore does not affect RF operation.

## Update channels

Alpha7-dev supports two named channels:

```text
main    promoted/tested project line
dev     active development/test line
```

Show the configured channel:

```bash
ywd-hotspotctl update-channel
```

Switch channels without applying anything yet:

```bash
sudo ywd-hotspotctl update-channel dev
sudo ywd-hotspotctl update-channel main
```

After a channel is set, normal commands follow it automatically:

```bash
sudo ywd-hotspotctl update --check
sudo ywd-hotspotctl update --dry-run
sudo ywd-hotspotctl update
```

A successful explicit branch update also remembers `main` or `dev` as the new channel:

```bash
sudo ywd-hotspotctl update --branch dev
```

That means an existing Alpha6 appliance can cross onto the development line once with `--branch dev`; after the update succeeds, future no-argument update commands follow `dev`.

Updating to a specific tag does **not** change the saved channel.

The channel is stored separately at:

```text
/etc/ywd-hotspot/update-channel
```

and is also reflected in build provenance/About data.

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

## Alpha6 executable-bit migration hotfix

The first Alpha6 migration script applied `chmod` to files inside `/opt/ywd-hotspot/repo`. Because those files were initially committed without executable mode, Git reported mode-only changes as local modifications and the safety guard correctly stopped the update.

Current code fixes that behavior. The managed checkout no longer mutates tracked permissions, ignores executable-bit-only drift, and still refuses actual content changes.

If migration stopped with a list similar to:

```text
 M GITHUB-UPDATE.sh
 M INSTALL.sh
 M MIGRATE-TO-GITHUB.sh
 M UPDATE.sh
 M bin/ywd-hotspotctl
 M lib/dashboard.py
```

recover with:

```bash
sudo git -C /opt/ywd-hotspot/repo config core.fileMode false
sudo git -C /opt/ywd-hotspot/repo status --short
```

For this specific bug, the second command should print nothing. If it still prints modified files, stop and inspect them before proceeding; the updater will not destroy genuine local content changes.

When the status is clean, rerun the migration from the clone you originally used:

```bash
cd ~/tmp/ywd-hotspot
sudo ./MIGRATE-TO-GITHUB.sh
```

The old launcher can safely complete the migration after `core.fileMode=false` because it will fetch the corrected candidate. No MMDVM-Host or DMRGateway rebuild is required.

## Check for updates

```bash
sudo ywd-hotspotctl update --check
```

This fetches Git metadata and compares the installed build information to the selected channel/ref. It does not restart or stop services.

Example output is similar to:

```text
Installed : 0.1.0-alpha7-dev
Commit    : 1234567890
Target    : 0.1.0-alpha7-dev
Source    : dev @ abcdef1234
Channel   : dev
Status    : update available
```

## Validate without applying

```bash
sudo ywd-hotspotctl update --dry-run
```

The updater:

- fetches the canonical repository
- resolves the selected channel/branch/tag
- stages the candidate outside the live app
- checks required files
- runs `bash -n` on shell entry points
- runs Python bytecode compilation checks
- exits without touching `/opt/ywd-hotspot/app` or service state

## Apply an update

Follow the saved update channel:

```bash
sudo ywd-hotspotctl update
```

Explicit branch:

```bash
sudo ywd-hotspotctl update --branch main
sudo ywd-hotspotctl update --branch dev
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
4. refuses a dirty checkout containing content changes
5. resolves the saved channel or explicit branch/tag
6. fetches branches/tags
7. resolves the target commit/version
8. stages the commit separately
9. validates the staged source
10. invokes the normal transactional `UPDATE.sh`
11. advances `/opt/ywd-hotspot/repo` only after the live update succeeds
12. persists a successful `main`/`dev` branch selection as the channel

Executable-bit-only drift is ignored in the managed checkout; file-content changes are still treated as dirty and block updates.

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

The same information, including the update channel, appears in the WebUI header and About page.

Build provenance is stored in the non-secret file:

```text
/etc/ywd-hotspot/build-info.json
```

## Local changes in the managed checkout

Updates intentionally refuse actual content changes reported by:

```bash
git -C /opt/ywd-hotspot/repo status --short
```

If it shows modifications after mode-only drift has been ignored, investigate them. The updater will not silently destroy local edits.

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

Before replacing the live application, the updater creates a directory like:

```text
/var/backups/ywd-hotspot/pre-0.1.0-alpha7-dev-YYYYMMDD-HHMMSS/
```

It contains protected archives of configuration and the previous deployed application. Configuration archives can contain reusable credentials; keep them private.

Normal configuration-history rollback remains separate from full application-update rollback.

## Updating pinned upstream radio components

Do not change `pins.env` during calibration/stability work merely because newer upstream commits exist. Moving an RF-stack pin changes the calibration/test baseline and should be its own deliberate build/regression-test event.
