<p align="center">
  <img src="assets/branding/ywd-hotspot-badge-256.webp" alt="YWD-Hotspot logo" width="220">
</p>

# YWD-Hotspot

**A lightweight DMR hotspot stack for Raspberry Pi + MMDVM HAT hardware.**

YWD-Hotspot is a small, purpose-built alternative to a full hotspot distribution. It runs the RF path with pinned upstream **MMDVM-Host** and **DMRGateway**, then adds a lightweight local dashboard, activity collector, OLED support, diagnostics, BrandMeister controls, transactional configuration, and calibration tools without dragging a heavyweight web stack onto the Pi.

> **Development status:** `0.1.0-alpha5` is currently under test. The last confirmed known-good checkpoint is `0.1.0-alpha4.1`. Alpha software can break; keep backups and do not expose the dashboard directly to the public Internet.

## Primary target

The current development and test target is:

- Raspberry Pi Zero W Rev 1.1 (original Zero W, not Zero 2 W)
- Raspberry Pi OS Lite 32-bit / Raspbian 13 (trixie)
- Simplex MMDVM_HS_Hat / JumboSpot-style board
- STM32 + ADF7021 modem hardware
- `/dev/serial0` at 115200 baud
- SSD1306-like 128x64 I2C OLED at `0x3C` when fitted
- DMR simplex operation through BrandMeister

Other Raspberry Pi models may work, but the original Pi Zero W is the performance and compatibility baseline for this project.

## What it includes

- Pinned MMDVM-Host and DMRGateway builds
- DMR-only simplex configuration
- BrandMeister connectivity and server-side API controls
- Live **RX FROM RADIO** / **TX TO RADIO** activity
- Last Heard with caller/TG, BER, RSSI and packet-loss information when available
- RadioID callsign lookup with lightweight periodic updates
- Transactional web configuration with validation, history and rollback
- RF-safe start/stop/restart behavior
- Local web-control password for write/admin actions
- Approximate city/state or ZIP/postal location lookup
- Calibration baseline + RX BER test session tools
- Health, persistent journaling and sanitized diagnostic exports
- Optional I2C OLED status display
- Plain HTML/CSS/JS dashboard with no Node.js, database server, Docker, or frontend framework

## Architecture

```text
DMR HT
  |
  v
MMDVM HAT
  |
  v
MMDVM-Host
  |
  v
DMRGateway
  |
  v
BrandMeister

Side services:
  activity collector
  dashboard
  OLED
  CLI/admin helper
```

The dashboard, OLED and activity presentation are intentionally outside the RF-critical path. If the dashboard dies, DMR should keep working.

## Fresh install from GitHub

Until the repository URL is finalized, replace `OWNER` below with the GitHub account or organization that owns the repository.

```bash
sudo apt update
sudo apt install -y git
cd ~
git clone https://github.com/OWNER/ywd-hotspot.git
cd ywd-hotspot
chmod +x INSTALL.sh UPDATE.sh UNINSTALL.sh bin/ywd-hotspotctl lab/mmdvm-diag.sh lib/*.py
sudo ./INSTALL.sh
```

On an original Pi Zero W, YWD-Hotspot expects the PL011 UART to be available as:

```text
/dev/serial0 -> /dev/ttyAMA0
```

If the installer reports a UART problem, run:

```bash
sudo ./lab/mmdvm-diag.sh
```

Choose **option 5** to apply the recommended Pi Zero W PL011 configuration, reboot, return to the repository, and run `sudo ./INSTALL.sh` again.

The installer:

- verifies Raspberry Pi hardware and probes the MMDVM modem read-only
- installs required Debian packages
- creates the restricted `ywd-hotspot` service account
- clones and builds the pinned upstream radio components using `make -j1`
- installs the YWD-Hotspot services and CLI
- runs the interactive configuration wizard
- enables persistent crash journaling by default
- starts dashboard/activity services
- starts the OLED only when configured and detected
- **does not start RF unless you explicitly type `ENABLE-RF`**

A fresh build of MMDVM-Host and DMRGateway can take a while on an original Pi Zero W. That is normal.

For the full install walkthrough, see [docs/INSTALL.md](docs/INSTALL.md).

## After installation

Check the appliance:

```bash
ywd-hotspotctl status
```

Set the local dashboard write-control password:

```bash
sudo ywd-hotspotctl web-password
```

If you want BrandMeister API features such as Drop QSO and static/dynamic talkgroup controls, set the API v2 key separately:

```bash
sudo ywd-hotspotctl bm-api-key
```

Then open:

```text
http://PI-IP:8080/
```

The dashboard port is configurable and may differ from `8080`.

## Updating a Git clone

```bash
cd ~/ywd-hotspot
git pull --ff-only
chmod +x INSTALL.sh UPDATE.sh UNINSTALL.sh bin/ywd-hotspotctl lab/mmdvm-diag.sh lib/*.py
sudo ./UPDATE.sh
```

The Alpha5 updater creates a protected config backup first, does **not** rebuild MMDVM-Host or DMRGateway, and preserves whether the RF path was active/enabled before the update.

See [docs/UPGRADING.md](docs/UPGRADING.md) before updating a working hotspot.

## CLI

```bash
ywd-hotspotctl status
ywd-hotspotctl health
ywd-hotspotctl lastheard
ywd-hotspotctl logs
sudo ywd-hotspotctl configure
sudo ywd-hotspotctl apply
sudo ywd-hotspotctl diagnostics
sudo ywd-hotspotctl backup
sudo ywd-hotspotctl restart
sudo ywd-hotspotctl start
sudo ywd-hotspotctl stop
sudo ywd-hotspotctl update-ids
sudo ywd-hotspotctl lab
```

Running `sudo ywd-hotspotctl` with no command opens the interactive control menu.

## Configuration and runtime data

Canonical configuration:

```text
/etc/ywd-hotspot/config.json
```

Generated radio configuration:

```text
/etc/ywd-hotspot/MMDVM-Host.ini
/etc/ywd-hotspot/DMRGateway.ini
```

Runtime/history data is stored under:

```text
/var/lib/ywd-hotspot/
```

Protected configuration backups are stored under:

```text
/var/backups/ywd-hotspot/
```

Backups can contain credentials. Treat them as secrets.

## Security

The web dashboard is **plain HTTP** and is intended for a trusted LAN. Do not forward the dashboard port directly from the Internet.

The following credentials are intentionally separate:

- BrandMeister Hotspot Security password
- BrandMeister API v2 key
- local YWD-Hotspot web-control password

The API key stays on the Pi and is not returned to browser JavaScript. Diagnostic/support exports are designed to redact reusable credentials.

Read [SECURITY.md](SECURITY.md) before exposing, modifying, or publishing a deployment.

## Pinned upstream radio components

YWD-Hotspot currently pins:

```text
MMDVM-Host
  repo   https://github.com/g4klx/MMDVM-Host.git
  commit dea6e9b2c35857fe6f904c5092bebadb86cbf079

DMRGateway
  repo   https://github.com/g4klx/DMRGateway.git
  commit 2a3306de313cf4c094c2031c9ced5a6858bbbfcc
```

Do not casually move these pins while calibration/stability testing is in progress.

## Current development focus

Alpha5 is the calibration-prep/UI-polish build. Once it is confirmed stable, feature work should freeze while controlled DMR calibration is performed. The first calibration target is **RXOffset using repeatable Parrot transmissions and measured BER**. TX calibration is a separate problem because the hotspot cannot directly measure the receiving handheld's BER.

See [docs/CALIBRATION.md](docs/CALIBRATION.md).

## Documentation

- [Installation](docs/INSTALL.md)
- [Upgrading](docs/UPGRADING.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Calibration](docs/CALIBRATION.md)
- [GitHub repository setup](docs/GITHUB-SETUP.md)
- [Security](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## License

A project license has not yet been selected. No `LICENSE` file is included in this repository-prep package; choose the intended license before treating the repository as an open-source distribution.
