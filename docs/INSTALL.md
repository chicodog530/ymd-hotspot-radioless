# Installing YWD-Hotspot from GitHub

This document covers both a fresh installation and adoption of an existing archive-installed YWD-Hotspot system.

Canonical repository:

```text
https://github.com/merberg-ai/ywd-hotspot
```

## 1. Hardware and OS baseline

Current primary development target:

```text
Raspberry Pi Zero W Rev 1.1
Raspberry Pi OS Lite 32-bit / Raspbian 13 (trixie)
MMDVM_HS_Hat / JumboSpot-style simplex board
UART: /dev/serial0 at 115200
Pi Zero W expected mapping: /dev/serial0 -> /dev/ttyAMA0
OLED: I2C bus 1, normally 0x3C
```

Before enabling RF, attach a suitable antenna and verify the configured frequency.

Useful preflight commands:

```bash
cat /etc/os-release
uname -a
uname -m
ls -l /dev/serial0 2>/dev/null || true
readlink -f /dev/serial0 2>/dev/null || true
```

## 2. Clone the repository

```bash
sudo apt update
sudo apt install -y git

cd ~
git clone https://github.com/merberg-ai/ywd-hotspot.git
cd ywd-hotspot
```

Normalize executable permissions before running scripts:

```bash
chmod +x INSTALL.sh UPDATE.sh UNINSTALL.sh GITHUB-UPDATE.sh MIGRATE-TO-GITHUB.sh
chmod +x bin/ywd-hotspotctl lab/mmdvm-diag.sh
chmod +x lib/*.py
```

`.gitattributes` keeps source/script line endings on LF. This prevents the classic CRLF shell-script disaster from eating an evening for no good reason.

## 3. Existing YWD-Hotspot installation

If `/etc/ywd-hotspot/config.json` and `/opt/ywd-hotspot/app` already exist, `INSTALL.sh` detects the current appliance before doing any radio-stack compilation.

It offers:

```text
1) Adopt existing installation and switch to GitHub updates
2) Full/recovery installation
3) Cancel
```

For an existing working hotspot, use **option 1**.

That path:

- preserves `/etc/ywd-hotspot/config.json`
- preserves BrandMeister credentials
- preserves the web-control password
- preserves calibration/history/runtime data
- preserves the current RF active/enabled state
- creates/refreshes `/opt/ywd-hotspot/repo`
- installs the current YWD application layer
- does **not** compile MMDVM-Host or DMRGateway

The same migration can be invoked directly:

```bash
sudo ./MIGRATE-TO-GITHUB.sh
```

This is the intended transition from previous `.tar.gz`/`.zip` installs to GitHub-managed updates.

## 4. Fresh-install UART/modem verification

For a genuinely fresh installation, run:

```bash
sudo ./lab/mmdvm-diag.sh
```

Option **1** runs the full read-only diagnostic set. Option **2** performs only the MMDVM firmware probe.

On the original Pi Zero W the target mapping is:

```text
/dev/serial0 -> /dev/ttyAMA0
```

If it is not correct, option **5** applies the recommended PL011 configuration. It:

- backs up the boot configuration
- sets `enable_uart=1`
- adds `dtoverlay=disable-bt`
- removes UART serial-console tokens from the kernel command line
- disables `hciuart`
- requires a reboot

Bluetooth is disabled by that configuration; Wi-Fi is not.

After reboot:

```bash
cd ~/ywd-hotspot
readlink -f /dev/serial0
sudo ./lab/mmdvm-diag.sh
```

## 5. Run the installer

```bash
cd ~/ywd-hotspot
sudo ./INSTALL.sh
```

A fresh installation performs these high-level actions:

1. verifies Raspberry Pi hardware
2. verifies `/dev/serial0` and the Pi Zero W mapping
3. sends a read-only MMDVM `GET_VERSION` probe
4. installs required build/runtime packages
5. creates the restricted `ywd-hotspot` service account
6. clones MMDVM-Host and DMRGateway into `/opt/ywd-hotspot/src`
7. checks out the exact commits in `pins.env`
8. compiles both upstream programs with `make -j1`
9. deploys YWD-Hotspot to `/opt/ywd-hotspot/app`
10. installs systemd units, CLI, admin helper and restricted sudo policy
11. writes build/source provenance to `/etc/ywd-hotspot/build-info.json`
12. creates a managed Git checkout at `/opt/ywd-hotspot/repo` when installed from the canonical Git repository
13. runs the configuration wizard
14. performs an initial DMR ID update when possible
15. configures persistent journaling
16. starts dashboard/activity services
17. starts OLED only when configured and detected
18. asks for explicit RF-enable confirmation

The original Pi Zero W is not exactly a build server. The first MMDVM-Host/DMRGateway compile can take a while; later normal YWD updates do not repeat that compile.

## 6. Configuration wizard

The wizard collects the primary station/network settings, including:

- callsign
- base DMR ID
- hotspot ESSID suffix
- simplex frequency
- DMR Color Code
- BrandMeister master/UDP port
- BrandMeister Hotspot Security password
- location/description/coordinates
- antenna height and station URL
- RX/TX offsets and levels
- RF level and DMR jitter
- dashboard port
- OLED brightness/idle behavior
- RF-at-boot policy
- persistent journal policy

Canonical configuration:

```text
/etc/ywd-hotspot/config.json
```

Generated runtime files:

```text
/etc/ywd-hotspot/MMDVM-Host.ini
/etc/ywd-hotspot/DMRGateway.ini
```

Do not hand-maintain the generated INI files. Change canonical configuration through YWD-Hotspot and let it regenerate them.

## 7. RF enable confirmation

At the end of a fresh install the installer asks:

```text
Type ENABLE-RF to start AND enable RF at boot now:
```

Only the exact text `ENABLE-RF` starts/enables the RF path. Any other response leaves MMDVM-Host/DMRGateway stopped and disabled.

This safety behavior also applies to update/migration logic: source management must never unexpectedly key or enable a transmitter.

## 8. Configure local web control

The status dashboard is readable without a control login. Write/admin operations remain locked until a local control password is configured:

```bash
sudo ywd-hotspotctl web-password
```

This credential is separate from BrandMeister credentials.

## 9. Configure the BrandMeister API key

Set the separate BrandMeister API v2 key with:

```bash
sudo ywd-hotspotctl bm-api-key
```

The key remains server-side on the Pi and is not returned to browser JavaScript.

## 10. Verify installation and source provenance

```bash
ywd-hotspotctl status
ywd-hotspotctl source
```

The second command should show repository/branch/commit metadata when the appliance is GitHub-managed.

Expected services include:

```text
ywd-mmdvmhost.service
ywd-dmrgateway.service
ywd-dashboard.service
ywd-activity.service
ywd-oled.service
ywd-dmrid-update.timer
```

Whether the RF services are active depends on explicit operator choice.

## 11. Open the dashboard

Find the Pi address:

```bash
hostname -I
```

Then browse to:

```text
http://PI-IP:8080/
```

Use the configured dashboard port if it differs from `8080`.

The dashboard is intentionally plain HTTP. Keep it on a trusted LAN and do not forward it directly to the public Internet.

The **About** page displays:

- optimized YWD-Hotspot logo
- YWD-Hotspot version
- Git branch/ref and commit SHA
- commit date/source state
- repository link
- `kj6ywd.net` link
- KJ6YWD author credit

## 12. First GitHub update check

Once GitHub management is active:

```bash
sudo ywd-hotspotctl update --check
sudo ywd-hotspotctl update --dry-run
```

Neither command changes the running application or RF service state. `--check` reports availability; `--dry-run` additionally stages and validates the candidate.

See [UPGRADING.md](UPGRADING.md) before applying updates.

## 13. OLED notes

The installer scans I2C bus 1. The primary test HAT uses an SSD1306-like display at `0x3C`.

```bash
i2cdetect -y 1
```

OLED failure/absence must not interrupt DMR operation.

## 14. Known harmless DMRGateway MQTT message

Upstream DMRGateway may attempt a localhost MQTT connection and log connection-refused even though YWD-Hotspot does not depend on a local MQTT broker. Do not install Mosquitto solely to silence that message.

## 15. Troubleshooting

UART/HAT problem:

```bash
sudo ./lab/mmdvm-diag.sh
```

BrandMeister/network problem:

```bash
ywd-hotspotctl status
ywd-hotspotctl logs
```

Dashboard problem:

```bash
systemctl status ywd-dashboard.service --no-pager
journalctl -u ywd-dashboard.service -n 100 --no-pager
```

GitHub management problem:

```bash
ywd-hotspotctl source
git -C /opt/ywd-hotspot/repo status --short
git -C /opt/ywd-hotspot/repo remote -v
```

Do not paste reusable credentials into public GitHub issues.

## 16. Uninstall

From a repository checkout or installed source copy:

```bash
sudo ./UNINSTALL.sh
```

The uninstaller intentionally preserves configuration/runtime data by default so credentials/history are not casually destroyed.
