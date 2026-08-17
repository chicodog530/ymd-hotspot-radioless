# 📚 YWD-Hotspot Documentation

<p align="center"><strong>Pick the job you are trying to do and jump straight to the right guide.</strong></p>

[← Back to project README](../README.md)

---

## 🧭 Documentation map

| I want to… | Guide |
|---|---|
| 🚀 Install a new hotspot | **[Installation](INSTALL.md)** |
| 🔁 Move an older archive install to GitHub | **[Installation](INSTALL.md#-existing-install--github-management)** |
| 🔄 Check/apply updates or switch `main` / `dev` | **[Upgrading](UPGRADING.md)** |
| 🛠️ Recover from an update/migration problem | **[Upgrading](UPGRADING.md#-recovery-and-rollback)** |
| 📻 Manage BrandMeister static/dynamic talkgroups | **[Talkgroup Manager](TALKGROUPS.md)** |
| 📟 Configure LIVE DMR gauges and OLED runtime display | **[Display + Instrumentation](DISPLAY.md)** |
| 🧪 Calibrate RXOffset with BER measurements | **[Calibration](CALIBRATION.md)** |
| 🧱 Understand the RF/runtime architecture | **[Architecture](ARCHITECTURE.md)** |
| 🌿 Understand branches, source layout, and dev checks | **[GitHub / Development](GITHUB-SETUP.md)** |
| 🔐 Review secrets/network exposure rules | **[Security](../SECURITY.md)** |
| 🤝 Contribute a change | **[Contributing](../CONTRIBUTING.md)** |
| 🗒️ See project checkpoints | **[Changelog](../CHANGELOG.md)** |

## 📡 Core operating rules

A few project rules show up everywhere because they are intentional design constraints:

- **RF never starts merely because an install/update happened.**
- `/etc/ywd-hotspot/config.json` is canonical; generated INI files are outputs.
- `/opt/ywd-hotspot/repo` is managed source; `/opt/ywd-hotspot/app` is deployed runtime.
- reusable credentials stay out of browser-readable data and public diagnostics.
- the dashboard/OLED/activity services stay outside the DMR-critical path.
- on YWD-Hotspot OS, one authoritative OLED daemon owns the SSD1306/I2C device.
- enhanced WebUI instrumentation is optional; Basic mode preserves the lightweight status UI.
- the original Raspberry Pi Zero W remains the performance budget.

## 🌿 Branch model

| Branch | Purpose |
|---|---|
| `main` | promoted/conservative project line |
| `dev` | active development and Pi test line |
| `dev-alpha9.2-known-good` | checkpoint of the user-tested Alpha9.2 polish build |

The installed appliance remembers its selected update channel. See **[Upgrading](UPGRADING.md)**.

## 🆘 Useful first commands

```bash
ywd-hotspotctl status
ywd-hotspotctl source
ywd-hotspotctl health
```

For a sanitized support bundle:

```bash
sudo ywd-hotspotctl diagnostics
```

Never post protected backups, raw credential files, or reusable BrandMeister/WebUI secrets.
