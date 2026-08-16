<p align="center">
  <img src="assets/branding/ywd-hotspot-badge-256.webp" alt="YWD-Hotspot logo" width="220">
</p>

# YWD-Hotspot

**A lightweight DMR hotspot stack for Raspberry Pi + MMDVM HAT hardware.**

YWD-Hotspot is a small, purpose-built alternative to a full hotspot distribution. It keeps the RF path on pinned upstream **MMDVM-Host** and **DMRGateway**, then adds a lightweight local dashboard, activity collector, OLED support, BrandMeister controls, transactional configuration, diagnostics, calibration tools, build provenance, and safe GitHub-managed updates without dragging a heavyweight web stack onto the Pi.

> **Development status:** `0.1.0-alpha6` is the current development/test build. `0.1.0-alpha4.1` remains the last explicitly confirmed known-good checkpoint. Alpha software can break; keep backups and do not expose the dashboard directly to the public Internet.

Canonical repository: **https://github.com/merberg-ai/ywd-hotspot**

## Primary target

The current development and test target is:

- Raspberry Pi Zero W Rev 1.1 (original Zero W, not Zero 2 W)
- Raspberry Pi OS Lite 32-bit / Raspbian 13 (trixie)
- Simplex MMDVM_HS_Hat / JumboSpot-style board
- STM32 + ADF7021 modem hardware
- `/dev/serial0` at 115200 baud
- SSD1306-like 128x64 I2C OLED at `0x3C` when fitted
- DMR simplex operation through BrandMeister

Other Raspberry Pi models may work, but the original Pi Zero W is the performance and compatibility baseline.

## What it includes

- pinned MMDVM-Host and DMRGateway builds
- DMR-only simplex configuration
- BrandMeister connectivity and server-side API controls
- live **RX FROM RADIO** / **TX TO RADIO** activity
- Last Heard with caller/TG, BER, RSSI and packet-loss information when available
- RadioID callsign lookup with lightweight periodic updates
- transactional web configuration with validation, history and rollback
- RF-safe start/stop/restart behavior
- local web-control password for write/admin actions
- approximate city/state or ZIP/postal location lookup
- calibration baseline + RX BER test session tools
- health, persistent journaling and sanitized diagnostic exports
- optional I2C OLED status display
- About page with project/author/repository information
- branch/commit/build provenance in the dashboard header and About page
- GitHub-managed update checking, staging, validation and safe apply
- migration path from older archive-installed builds without recompiling the radio stack
- plain HTML/CSS/JS dashboard with no Node.js, database server, Docker, or frontend framework

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

The deployed application and Git checkout are kept separate:

```text
/opt/ywd-hotspot/app     deployed runtime; no .git directory
/opt/ywd-hotspot/repo    root-owned managed Git checkout
```

This lets YWD-Hotspot fetch and validate an update before touching the live application.

## Fresh install from GitHub

```bash
sudo apt update
sudo apt install -y git

cd ~
git clone https://github.com/merberg-ai/ywd-hotspot.git
cd ywd-hotspot

chmod +x INSTALL.sh UPDATE.sh UNINSTALL.sh GITHUB-UPDATE.sh MIGRATE-TO-GITHUB.sh
chmod +x bin/ywd-hotspotctl lab/mmdvm-diag.sh lib/*.py

sudo ./INSTALL.sh
```

On an original Pi Zero W, YWD-Hotspot expects:

```text
/dev/serial0 -> /dev/ttyAMA0
```

If the installer reports a UART problem:

```bash
sudo ./lab/mmdvm-diag.sh
```

Choose **option 5** to apply the recommended Pi Zero W PL011 configuration, reboot, return to the repository, and run `sudo ./INSTALL.sh` again.

A genuinely fresh installation builds the pinned MMDVM-Host and DMRGateway commits using `make -j1`. That can take a while on an original Pi Zero W.

The installer **does not start RF unless you explicitly type `ENABLE-RF`**.

See [docs/INSTALL.md](docs/INSTALL.md) for the complete walkthrough.

## Existing installation: switch to GitHub management

If `INSTALL.sh` detects an existing YWD-Hotspot installation, it offers:

```text
1) Adopt existing installation and switch to GitHub updates
2) Full/recovery installation
3) Cancel
```

The normal migration path is option **1**. It preserves configuration, credentials, calibration/history data, and current RF service state. It **does not rebuild MMDVM-Host or DMRGateway**.

You can also run the migration directly from a fresh clone:

```bash
cd ~
git clone https://github.com/merberg-ai/ywd-hotspot.git
cd ywd-hotspot
chmod +x INSTALL.sh UPDATE.sh UNINSTALL.sh GITHUB-UPDATE.sh MIGRATE-TO-GITHUB.sh
chmod +x bin/ywd-hotspotctl lab/mmdvm-diag.sh lib/*.py
sudo ./MIGRATE-TO-GITHUB.sh
```

This is the intended path for older `.tar.gz`/`.zip` installations.

## After installation

Check the appliance and source provenance:

```bash
ywd-hotspotctl status
ywd-hotspotctl source
```

Configure the local dashboard write-control password:

```bash
sudo ywd-hotspotctl web-password
```

Configure the separate BrandMeister API v2 key if you want Drop QSO/static TG controls:

```bash
sudo ywd-hotspotctl bm-api-key
```

Then open:

```text
http://PI-IP:8080/
```

The dashboard port is configurable and may differ from `8080`.

## GitHub-managed updates

Normal updates no longer require manually entering the checkout and running `git pull`.

Check for an update without changing services:

```bash
sudo ywd-hotspotctl update --check
```

Fetch and validate the candidate without changing the live application:

```bash
sudo ywd-hotspotctl update --dry-run
```

Apply the current `main` branch after an explicit confirmation:

```bash
sudo ywd-hotspotctl update
```

Specific refs are also supported:

```bash
sudo ywd-hotspotctl update --branch main
sudo ywd-hotspotctl update --tag v0.1.0-alpha6
```

The GitHub updater:

1. leaves the running hotspot alone while fetching
2. refuses a dirty/unexpected managed checkout
3. resolves the requested branch/tag
4. stages the candidate separately
5. validates required files, shell syntax and Python syntax
6. calls the transactional `UPDATE.sh`
7. preserves RF active/enabled state
8. updates the managed checkout only after the live update succeeds

`UPDATE.sh` also keeps protected pre-update copies of the configuration and deployed application. If applying the new runtime fails, it attempts to restore the previous app/config and service state.

It does **not** rebuild MMDVM-Host or DMRGateway.

See [docs/UPGRADING.md](docs/UPGRADING.md).

## Build provenance / About page

Install/update writes non-secret provenance to:

```text
/etc/ywd-hotspot/build-info.json
```

The dashboard header and About page display information such as:

```text
Version       0.1.0-alpha6
Git branch    main
Git commit    <commit SHA>
Commit date   <Git commit date>
Source        github
Source state  clean
```

The About page also displays the optimized YWD-Hotspot logo, links to the canonical GitHub repository and `https://kj6ywd.net`, and credits **KJ6YWD**.

## CLI

```bash
ywd-hotspotctl status
ywd-hotspotctl source
ywd-hotspotctl health
ywd-hotspotctl lastheard
ywd-hotspotctl logs

sudo ywd-hotspotctl update --check
sudo ywd-hotspotctl update --dry-run
sudo ywd-hotspotctl update
sudo ywd-hotspotctl migrate-github

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

Runtime/history data:

```text
/var/lib/ywd-hotspot/
```

Managed source checkout:

```text
/opt/ywd-hotspot/repo/
```

Protected update/config backups:

```text
/var/backups/ywd-hotspot/
```

Backups can contain credentials. Treat them as secrets.

## Security

The web dashboard is **plain HTTP** and intended for a trusted LAN. Do not forward the dashboard port directly from the Internet.

These credentials remain intentionally separate:

- BrandMeister Hotspot Security password
- BrandMeister API v2 key
- local YWD-Hotspot web-control password

The API key stays on the Pi and is not returned to browser JavaScript. Diagnostic/support exports are designed to redact reusable credentials.

GitHub update code accepts only the canonical YWD-Hotspot repository as the managed origin and refuses a dirty checkout rather than silently destroying local changes.

Read [SECURITY.md](SECURITY.md).

## Pinned upstream radio components

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

Alpha6 adds repository provenance, About/branding integration and the GitHub migration/update path on top of the Alpha5 calibration-prep UI. The next major RF engineering task remains controlled DMR calibration, beginning with **RXOffset using repeatable Parrot transmissions and measured BER**, followed by a stability soak.

See [docs/CALIBRATION.md](docs/CALIBRATION.md).

## Documentation

- [Installation](docs/INSTALL.md)
- [Upgrading and GitHub migration](docs/UPGRADING.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Calibration](docs/CALIBRATION.md)
- [Repository notes](docs/GITHUB-SETUP.md)
- [Security](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## License

YWD-Hotspot is released under the [Unlicense](LICENSE) / public-domain dedication included in this repository.
