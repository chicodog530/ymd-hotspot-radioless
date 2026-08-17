# 🔄 Upgrading YWD-Hotspot

[← Docs index](README.md) · [Installation](INSTALL.md) · [Display](DISPLAY.md) · [Project README](../README.md) · [Security](../SECURITY.md)

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

## 🌐 About-page updater

On GitHub-managed installs, the About page exposes software-update controls when WebUI controls are unlocked.

The browser can:

1. check the saved `main`/`dev` channel
2. show current and candidate version/commit
3. refuse installation when canonical config has saved-but-not-applied changes
4. request an update through the narrow authenticated admin action
5. display stage-driven update progress
6. reconnect after the dashboard restarts

The browser does **not** pass arbitrary branch names, URLs, filesystem paths, or shell commands to root.

The actual install runs as the detached one-shot service:

```text
ywd-update.service
```

The browser polls a sanitized local update-status endpoint. If the dashboard restarts during installation, the detached service continues independently.

## 🔎 Check for an update

CLI:

```bash
sudo ywd-hotspotctl update --check
```

WebUI:

```text
ABOUT → SOFTWARE UPDATE → CHECK FOR UPDATE
```

Checking fetches Git metadata and validates the selected channel/ref without stopping RF services.

## 🧪 Validate without applying

```bash
sudo ywd-hotspotctl update --dry-run
```

A dry run:

1. fetches the canonical repository
2. resolves the selected branch/tag
3. stages the candidate outside the live app
4. checks required runtime files, including display/update assets
5. runs `bash -n` on shell entry points and helper scripts
6. runs Python compile checks across `lib/*.py`
7. exits without replacing `/opt/ywd-hotspot/app`

RF/service state is unchanged.

## ⬆️ Apply an update

Follow the saved channel:

```bash
sudo ywd-hotspotctl update
```

Or use the authenticated About-page **INSTALL UPDATE** action.

Explicit CLI branch:

```bash
sudo ywd-hotspotctl update --branch main
sudo ywd-hotspotctl update --branch dev
```

Specific tag:

```bash
sudo ywd-hotspotctl update --tag v0.1.0-alpha6
```

The CLI updater asks for explicit confirmation before it applies a candidate. The WebUI uses its themed confirmation dialog before starting the detached update job.

## 📊 Update progress

The detached runner publishes sanitized stage/progress state under:

```text
/var/lib/ywd-hotspot/update-status.json
```

The WebUI progress modal advances only when real updater milestones are observed. The OLED may also display this status when its runtime configuration allows it.

Typical stages include candidate checking/validation, protected backup, runtime install, service-policy restoration, service verification, managed-source finalization, and completion.

Progress is intentionally coarse and stage-based; it is not a fake elapsed-time estimate.

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
- preserves YWD-Hotspot OS OLED ownership when present

## 📟 OLED ownership during updates

YWD-Hotspot OS keeps `ywd-headless-oled.service` as the sole SSD1306/I2C owner.

Updates install a systemd drop-in that points that existing service at the unified renderer. `ywd-oled.service` remains disabled on YWD-Hotspot OS. Display-related config apply/revert paths serialize the transition so the two units are never intentionally active against the display simultaneously.

Uninstall removes the drop-in and restores the image's original headless OLED command.

Generic/non-OS installations continue using `ywd-oled.service` normally.

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
/var/backups/ywd-hotspot/pre-VERSION-YYYYMMDD-HHMMSS/
```

It contains protected archives of the previous config and deployed application.

> [!CAUTION]
> Configuration backups can contain reusable credentials. Keep them private.

If runtime application fails during `UPDATE.sh`, the updater attempts to restore the previous application/configuration and service policy automatically.

If a WebUI update fails, inspect:

```bash
sudo cat /var/lib/ywd-hotspot/update-status.json
sudo journalctl -u ywd-update.service -n 150 --no-pager
```

### Dirty managed checkout

The updater intentionally refuses real content changes in:

```bash
git -C /opt/ywd-hotspot/repo status --short
```

Do not `git reset --hard` blindly. Investigate unexpected modifications first.

The managed checkout is source state, not a place for appliance configuration. Runtime config belongs under `/etc/ywd-hotspot`.

### Legacy single-branch checkout

Some early YWD-Hotspot OS images cloned only `dev-os`, which restricted the managed Git fetch refspec. Current update tooling widens the managed checkout to fetch canonical branches before resolving the saved `main`/`dev` channel.

### Alpha6 executable-bit migration hotfix

Early Alpha6 migration code changed tracked executable modes in `/opt/ywd-hotspot/repo`, causing Git's dirty-tree safety check to stop the migration.

Current code ignores mode-only drift while still refusing content changes.

For a system that stopped on that specific old bug:

```bash
sudo git -C /opt/ywd-hotspot/repo config core.fileMode false
sudo git -C /opt/ywd-hotspot/repo status --short
```

The second command should print nothing if the problem is only executable-bit drift. If it still lists modifications, inspect them before proceeding.

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

**Next:** [📟 Display + Instrumentation](DISPLAY.md) · [🚀 Installation](INSTALL.md) · [📚 Docs index](README.md)
