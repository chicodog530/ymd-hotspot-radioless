# 🔄 Upgrading YWD-Hotspot

[← Docs index](README.md) · [Installation](INSTALL.md) · [Project README](../README.md) · [Security](../SECURITY.md)

---

> [!IMPORTANT]
> **Update invariant:** an update must never unexpectedly enable RF.

Normal YWD application updates do **not** rebuild the pinned MMDVM-Host or DMRGateway binaries.

## 🧱 Managed layout

```text
/opt/ywd-hotspot/repo    root-owned managed Git checkout
/opt/ywd-hotspot/app     deployed runtime copy; no .git directory
/etc/ywd-hotspot         canonical config + build provenance
/var/backups/ywd-hotspot protected pre-update backups
```

The live runtime is deliberately separate from Git/network activity.

## 🌿 Update channels

YWD-Hotspot has two named channels:

| Channel | Purpose |
|---|---|
| `main` | promoted/conservative project line |
| `dev` | active development and Pi test line |

Show the current channel:

```bash
ywd-hotspotctl update-channel
```

Switch channel without applying anything yet:

```bash
sudo ywd-hotspotctl update-channel main
sudo ywd-hotspotctl update-channel dev
```

After that, normal update commands follow the saved channel automatically.

A successful explicit branch update also remembers `main` or `dev`:

```bash
sudo ywd-hotspotctl update --branch dev
```

Updating to a specific tag does **not** change the saved channel.

Channel file:

```text
/etc/ywd-hotspot/update-channel
```

## 🔎 Check for an update

```bash
sudo ywd-hotspotctl update --check
```

This fetches Git metadata and compares the installed build to the selected channel/ref. It does not stop/restart services.

## 🧪 Validate without applying

```bash
sudo ywd-hotspotctl update --dry-run
```

A dry run:

1. fetches the canonical repository
2. resolves the selected branch/tag
3. stages the candidate outside the live app
4. checks required runtime files
5. runs `bash -n` on shell entry points
6. runs Python compile checks
7. exits without replacing `/opt/ywd-hotspot/app`

RF/service state is unchanged.

## ⬆️ Apply an update

Follow the saved channel:

```bash
sudo ywd-hotspotctl update
```

Explicit branch:

```bash
sudo ywd-hotspotctl update --branch main
sudo ywd-hotspotctl update --branch dev
```

Specific tag:

```bash
sudo ywd-hotspotctl update --tag v0.1.0-alpha6
```

The updater asks for explicit confirmation before it applies a candidate.

## 🛡️ What the updater protects

`GITHUB-UPDATE.sh` handles source/network work first while the current hotspot keeps running:

1. acquires an update lock
2. verifies `/opt/ywd-hotspot/repo`
3. verifies the canonical repository origin
4. refuses real local content modifications
5. fetches branches/tags
6. resolves the selected target commit/version
7. stages the candidate separately
8. validates the candidate
9. calls transactional `UPDATE.sh`
10. advances the managed checkout only after the live update succeeds

`UPDATE.sh` then:

- records active/enabled service state
- creates protected config/app backups
- deploys the new YWD application layer
- reinstalls CLI/admin/sudoers/systemd pieces
- migrates/normalizes canonical config
- regenerates radio INIs
- writes build provenance
- preserves RF autostart policy
- restarts only services that need to come back
- restores the exact RF enabled/disabled boot policy

## 📡 RF behavior

Examples:

| Before update | After update |
|---|---|
| RF stopped + disabled | remains stopped + disabled |
| RF running + enabled | restarted as needed, then enabled state restored |
| dashboard stopped | update does not treat that as permission to start RF |

Always verify afterward:

```bash
ywd-hotspotctl status
```

## 🔁 Moving an older archive install to GitHub

Clone the canonical repository:

```bash
sudo apt update
sudo apt install -y git

cd ~
git clone https://github.com/merberg-ai/ywd-hotspot.git
cd ywd-hotspot
sudo ./MIGRATE-TO-GITHUB.sh
```

Migration adopts the promoted `main` line first and does **not** rebuild the RF binaries.

If you want the active test line afterward:

```bash
sudo ywd-hotspotctl update --branch dev
```

See **[INSTALL.md](INSTALL.md)** for the full migration/install flow.

## 🧯 Recovery and rollback

### Protected update backups

Before the live runtime is replaced, YWD-Hotspot creates a directory similar to:

```text
/var/backups/ywd-hotspot/pre-0.1.0-alpha10-dev-YYYYMMDD-HHMMSS/
```

It contains protected archives of the previous config and deployed application.

> [!CAUTION]
> Configuration backups can contain reusable credentials. Keep them private.

If runtime application fails during `UPDATE.sh`, the updater attempts to restore the previous application/configuration and service policy automatically.

### Dirty managed checkout

The updater intentionally refuses real content changes in:

```bash
git -C /opt/ywd-hotspot/repo status --short
```

Do not `git reset --hard` blindly. Investigate unexpected modifications first.

The managed checkout is source state, not a place for appliance configuration. Runtime config belongs under `/etc/ywd-hotspot`.

### Alpha6 executable-bit migration hotfix

Early Alpha6 migration code changed tracked executable modes in `/opt/ywd-hotspot/repo`, causing Git's dirty-tree safety check to stop the migration.

Current code ignores mode-only drift while still refusing content changes.

For a system that stopped on that specific old bug:

```bash
sudo git -C /opt/ywd-hotspot/repo config core.fileMode false
sudo git -C /opt/ywd-hotspot/repo status --short
```

The second command should print nothing if the problem is only executable-bit drift. If it still lists modifications, inspect them before proceeding.

Then rerun the migration from the clone you used:

```bash
cd ~/tmp/ywd-hotspot
sudo ./MIGRATE-TO-GITHUB.sh
```

No RF-stack rebuild is required.

## 🧭 Build/source information

```bash
ywd-hotspotctl source
```

The same provenance appears in the WebUI header/About page.

Non-secret provenance file:

```text
/etc/ywd-hotspot/build-info.json
```

## 🛠️ Manual source apply

A clean development checkout can still be applied manually:

```bash
cd ~/ywd-hotspot
git pull --ff-only
sudo ./UPDATE.sh
```

That is useful for recovery/development, but normal appliances should use `ywd-hotspotctl update` so target resolution, validation, channel behavior, and provenance remain consistent.

## 📌 Upstream RF pins

Do not move `pins.env` during unrelated UI/docs work merely because newer upstream commits exist. An upstream RF-stack pin change alters the calibration/stability baseline and deserves its own regression-test build.

---

**Next:** [🚀 Installation](INSTALL.md) · [📚 Docs index](README.md)
