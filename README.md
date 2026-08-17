<p align="center">
  <img src="assets/branding/ywd-hotspot-badge-256.webp" alt="YWD-Hotspot logo" width="220">
</p>

<h1 align="center">YWD-Hotspot</h1>
<p align="center"><strong>Lightweight DMR hotspot software for Raspberry Pi + MMDVM HAT hardware.</strong></p>
<p align="center">📡 DMR · 🎛️ BrandMeister · 🥧 Pi Zero W · 🧪 Calibration · 🔄 Safe GitHub updates</p>

<p align="center">
  <a href="#-quick-install">🚀 Install</a> ·
  <a href="#-updating">🔄 Update</a> ·
  <a href="#-talkgroup-manager">📻 Talkgroups</a> ·
  <a href="#-calibration">🧪 Calibration</a> ·
  <a href="docs/README.md">📚 Docs</a> ·
  <a href="SECURITY.md">🔐 Security</a>
</p>

---

> [!IMPORTANT]
> **Development status:** `0.1.0-alpha10-dev` is the active `dev` build. `0.1.0-alpha9.2-dev` was user-tested successfully and is preserved at `dev-alpha9.2-known-good`. `main` remains the promoted line and is intentionally more conservative than `dev`.

> [!WARNING]
> The built-in WebUI is plain HTTP for a trusted LAN. Do **not** forward the dashboard port directly to the public Internet.

## ✨ What is YWD-Hotspot?

YWD-Hotspot is a purpose-built DMR hotspot stack for small Raspberry Pi systems—especially the original **Raspberry Pi Zero W**. The RF path stays on pinned upstream **MMDVM-Host** and **DMRGateway**, while YWD-Hotspot adds a lightweight local UI, CLI, BrandMeister controls, diagnostics, calibration tools, OLED support, and safe GitHub-managed updates.

The design goal is simple: **make a DMR hotspot feel like a polished appliance without turning a Pi Zero into a tiny web-server science project.**

| Area | What YWD-Hotspot adds |
|---|---|
| 📡 RF | DMR-only simplex configuration, live RX/TX state, Last Heard, BER/RSSI context |
| 🎛️ BrandMeister | Static/dynamic TG controls, Drop QSO, Talkgroup Manager, directory search |
| 🌐 WebUI | Responsive dark UI, authenticated write controls, themed modals/toasts |
| 🧪 Calibration | Baseline save/restore, repeated BER samples, RXOffset recommendation, export |
| 🩺 Health | Service state, Wi-Fi/power/temperature checks, persistent journal, diagnostics |
| 📟 OLED | Optional lightweight I2C status/activity display |
| 💻 CLI | Colorized control console, status/source/calibration helpers |
| 🔄 Updates | Managed Git checkout, staging, validation, backups, rollback attempt, channels |

No Node.js runtime. No React/Vue. No SQL server. No Redis. No Docker.

## 🥧 Primary hardware target

Current development and test baseline:

- Raspberry Pi Zero W Rev 1.1 — original Zero W, not Zero 2 W
- Raspberry Pi OS Lite 32-bit / Raspbian 13 (trixie)
- Simplex MMDVM_HS_Hat / JumboSpot-style board
- STM32 + ADF7021 modem hardware
- `/dev/serial0` at 115200 baud
- expected Pi Zero mapping: `/dev/serial0 -> /dev/ttyAMA0`
- SSD1306-like 128×64 I2C OLED at `0x3C` when fitted
- DMR simplex through BrandMeister

Other Pi models may work, but the original Pi Zero W is the performance budget.

## 🚀 Quick install

### Promoted `main` line

A normal Git clone preserves the repository's executable bits, so a fresh install is intentionally short:

```bash
sudo apt update
sudo apt install -y git

cd ~
git clone https://github.com/merberg-ai/ywd-hotspot.git
cd ywd-hotspot
sudo ./INSTALL.sh
```

### Active `dev` line

For the current development build:

```bash
sudo apt update
sudo apt install -y git

cd ~
git clone --branch dev https://github.com/merberg-ai/ywd-hotspot.git
cd ywd-hotspot
sudo ./INSTALL.sh
```

> [!NOTE]
> If you are working from a ZIP/Windows copy that lost executable bits, run the entry point through Bash instead: `sudo bash ./INSTALL.sh`.

A genuinely fresh installation builds the pinned MMDVM-Host and DMRGateway commits with `make -j1`. On an original Pi Zero W, that can take a while. Normal YWD application updates do **not** repeat that compile.

The installer never starts RF unless you explicitly type:

```text
ENABLE-RF
```

Full walkthrough: **[docs/INSTALL.md](docs/INSTALL.md)**

## 🔁 Existing install → GitHub management

If an older archive-installed YWD-Hotspot is already working, do **not** rebuild the radio stack just to switch update methods.

```bash
cd ~
git clone https://github.com/merberg-ai/ywd-hotspot.git
cd ywd-hotspot
sudo ./MIGRATE-TO-GITHUB.sh
```

Migration preserves:

- canonical config
- BrandMeister credentials
- local WebUI control password
- calibration/history/runtime data
- current RF running/enabled policy

It does **not** rebuild MMDVM-Host or DMRGateway.

After migration, cross onto `dev` only if you want the active test line:

```bash
sudo ywd-hotspotctl update --branch dev
```

A successful `--branch dev` update remembers `dev` as the future update channel.

## ✅ After installation

Check the appliance:

```bash
ywd-hotspotctl status
ywd-hotspotctl source
```

Configure the local write-control password:

```bash
sudo ywd-hotspotctl web-password
```

Configure a separate BrandMeister API v2 key for TG/Drop-QSO controls:

```bash
sudo ywd-hotspotctl bm-api-key
```

Then open:

```text
http://PI-IP:8080/
```

The dashboard port is configurable.

## 🔄 Updating

YWD-Hotspot separates managed source from the live runtime:

```text
/opt/ywd-hotspot/repo    root-owned managed Git checkout
/opt/ywd-hotspot/app     deployed runtime copy; no .git directory
```

Normal update flow:

```bash
sudo ywd-hotspotctl update --check
sudo ywd-hotspotctl update --dry-run
sudo ywd-hotspotctl update
```

Update channels:

```bash
sudo ywd-hotspotctl update-channel main
sudo ywd-hotspotctl update-channel dev
```

The updater fetches and validates while the current hotspot keeps running, then applies only after explicit confirmation. It preserves the RF active/enabled policy and keeps a protected pre-update backup.

Full details and recovery notes: **[docs/UPGRADING.md](docs/UPGRADING.md)**

## 📻 Talkgroup Manager

The **TALKGROUPS** page gives BrandMeister static TG management a safer workflow:

1. search the public BrandMeister TG directory by ID or name
2. build a desired static-TG plan locally
3. preview exact `ADD` / `REMOVE` changes
4. press **APPLY PLAN**
5. confirm the plan in the themed YWD dialog

Browsing, favorites, saved sets, and plan editing do **not** change BrandMeister by themselves.

The directory is normalized and cached locally for 24 hours to stay cheap on a Pi Zero W.

Guide: **[docs/TALKGROUPS.md](docs/TALKGROUPS.md)**

## 🧪 Calibration

The RX workflow is intentionally measurement-driven:

- save a baseline
- change one variable at a time
- record repeated RF calls at each RXOffset
- compare average BER, not one lucky packet
- require at least 3 samples at an offset before recommending it
- require operator confirmation before applying the recommendation

TX calibration remains separate because the hotspot cannot directly measure the handheld receiver's BER.

Guide: **[docs/CALIBRATION.md](docs/CALIBRATION.md)**

## 🧱 Architecture

```text
DMR HT
  │
  ▼
MMDVM HAT
  │
  ▼
MMDVM-Host
  │
  ▼
DMRGateway
  │
  ▼
BrandMeister

Side services:
  ├─ activity collector
  ├─ dashboard / API
  ├─ OLED
  └─ RadioID updater
```

The dashboard/OLED/activity presentation stay outside the RF-critical path. If the WebUI dies, DMR should keep working.

Architecture notes: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**

## 🔐 Security model

YWD-Hotspot keeps three credentials deliberately separate:

1. BrandMeister Hotspot Security password
2. BrandMeister API v2 key
3. local YWD-Hotspot WebUI control password

The API key stays server-side and is never returned to browser JavaScript. Sanitized diagnostics are preferred for support; protected backups can contain reusable credentials and must remain private.

Read **[SECURITY.md](SECURITY.md)** before exposing or sharing anything from a real appliance.

## 🧭 Build provenance

Install/update writes non-secret provenance to:

```text
/etc/ywd-hotspot/build-info.json
```

The CLI and About page show:

```text
Version         0.1.0-alpha10-dev
Git branch      dev
Update channel  dev
Git commit      <commit SHA>
Commit date     <commit date>
Source          github
Source state    clean
```

## 💻 CLI quick reference

<details>
<summary><strong>Show common commands</strong></summary>

```bash
# Read-only/status
ywd-hotspotctl status
ywd-hotspotctl source
ywd-hotspotctl health
ywd-hotspotctl lastheard
ywd-hotspotctl logs
ywd-hotspotctl calibration

# Update management
sudo ywd-hotspotctl update --check
sudo ywd-hotspotctl update --dry-run
sudo ywd-hotspotctl update
sudo ywd-hotspotctl update-channel dev

# Config/support
sudo ywd-hotspotctl configure
sudo ywd-hotspotctl apply
sudo ywd-hotspotctl diagnostics
sudo ywd-hotspotctl backup
sudo ywd-hotspotctl lab

# RF/runtime
sudo ywd-hotspotctl restart
sudo ywd-hotspotctl start
sudo ywd-hotspotctl stop

# BrandMeister
sudo ywd-hotspotctl bm profile
sudo ywd-hotspotctl bm addtg 3100
sudo ywd-hotspotctl bm deltg 3100
sudo ywd-hotspotctl bm dropqso
sudo ywd-hotspotctl bm dropdyn
```

Running `sudo ywd-hotspotctl` with no subcommand opens the themed interactive control console.

</details>

Terminal colors are automatically disabled when output is redirected. Set `NO_COLOR=1` to force plain output.

## 📌 Pinned RF components

```text
MMDVM-Host
  repo   https://github.com/g4klx/MMDVM-Host.git
  commit dea6e9b2c35857fe6f904c5092bebadb86cbf079

DMRGateway
  repo   https://github.com/g4klx/DMRGateway.git
  commit 2a3306de313cf4c094c2031c9ced5a6858bbbfcc
```

Do not casually move these pins during calibration/stability work.

## 📚 Documentation

| Guide | Use it for |
|---|---|
| **[Documentation index](docs/README.md)** | Find the right guide quickly |
| **[Installation](docs/INSTALL.md)** | Fresh install, migration, UART/modem preflight |
| **[Upgrading](docs/UPGRADING.md)** | Channels, staged updates, rollback/recovery |
| **[Talkgroups](docs/TALKGROUPS.md)** | BrandMeister Talkgroup Manager |
| **[Calibration](docs/CALIBRATION.md)** | Controlled RX BER workflow |
| **[Architecture](docs/ARCHITECTURE.md)** | RF path, privilege boundaries, runtime layout |
| **[Repository / development](docs/GITHUB-SETUP.md)** | Branch model, validation, source workflow |
| **[Security](SECURITY.md)** | Credentials, exposure, diagnostics |
| **[Contributing](CONTRIBUTING.md)** | Project constraints and PR expectations |
| **[Changelog](CHANGELOG.md)** | Development checkpoints |

## 👤 Project

Written by **KJ6YWD**. Project home: **https://kj6ywd.net**  
Canonical repository: **https://github.com/merberg-ai/ywd-hotspot**

## 🙌 Acknowledgments

Special thanks to **KE0CGB** who forked the original author's work and provided significant inspiration and foundational improvements that made this project possible.

This project also integrates the [jmbe](https://github.com/DSheirer/jmbe) Java Multi-Band Excitation library for AMBE+2 encoding and decoding.

## 📄 License

YWD-Hotspot is released under the **[Unlicense](LICENSE)** / public-domain dedication included in this repository.
