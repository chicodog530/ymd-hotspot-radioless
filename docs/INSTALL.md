# 🚀 Installing YWD-Hotspot

[← Docs index](README.md) · [Project README](../README.md) · [Upgrading](UPGRADING.md) · [Security](../SECURITY.md)

---

> [!WARNING]
> YWD-Hotspot can control a radio transmitter. Attach a suitable antenna and verify the configured frequency before enabling RF.

## ✅ Supported test baseline

The primary development target is:

| Component | Current baseline |
|---|---|
| Raspberry Pi | Original **Pi Zero W Rev 1.1** |
| OS | Raspberry Pi OS Lite 32-bit / Raspbian 13 (trixie) |
| HAT | Simplex MMDVM_HS_Hat / JumboSpot-style |
| UART | `/dev/serial0` at 115200 |
| Pi Zero mapping | `/dev/serial0 -> /dev/ttyAMA0` |
| OLED | I2C bus 1, normally `0x3C` |
| Network | BrandMeister DMR simplex |

Useful preflight:

```bash
cat /etc/os-release
uname -a
uname -m
ls -l /dev/serial0 2>/dev/null || true
readlink -f /dev/serial0 2>/dev/null || true
```

## 🚀 Fresh install — promoted `main`

A normal Git clone preserves executable bits. No manual chmod pass is required.

```bash
sudo apt update
sudo apt install -y git

cd ~
git clone https://github.com/merberg-ai/ywd-hotspot.git
cd ywd-hotspot
sudo ./INSTALL.sh
```

If your source came from a ZIP/Windows copy and executable bits were lost:

```bash
sudo bash ./INSTALL.sh
```

## 🧪 Fresh install — active `dev`

To install the current development line directly:

```bash
sudo apt update
sudo apt install -y git

cd ~
git clone --branch dev https://github.com/merberg-ai/ywd-hotspot.git
cd ywd-hotspot
sudo ./INSTALL.sh
```

`dev` is for active testing. The promoted `main` line is intentionally more conservative.

## 🔁 Existing install → GitHub management

If `/etc/ywd-hotspot/config.json` and `/opt/ywd-hotspot/app` already exist, the installer detects the appliance before it does any radio-stack compilation.

`INSTALL.sh` offers:

```text
1) Adopt existing installation and switch to GitHub updates
2) Full/recovery installation
3) Cancel
```

For a working existing hotspot, choose **1**.

The direct migration path is even simpler:

```bash
sudo apt update
sudo apt install -y git

cd ~
git clone https://github.com/merberg-ai/ywd-hotspot.git
cd ywd-hotspot
sudo ./MIGRATE-TO-GITHUB.sh
```

Migration preserves:

- `/etc/ywd-hotspot/config.json`
- BrandMeister credentials
- local WebUI control password
- calibration/history/runtime data
- current RF active/enabled policy
- existing MMDVM-Host and DMRGateway binaries

It **does not** recompile MMDVM-Host or DMRGateway.

The migration intentionally adopts the promoted `main` line first. After it completes, opt into `dev` only if desired:

```bash
sudo ywd-hotspotctl update --branch dev
```

That successful branch update becomes the saved update channel.

## 🔌 UART / modem preflight

For a fresh Pi, run the hardware lab before installation if `/dev/serial0` is missing or mapped incorrectly:

```bash
cd ~/ywd-hotspot
sudo ./lab/mmdvm-diag.sh
```

Useful choices:

- **1** — full read-only diagnostic set
- **2** — MMDVM firmware probe only
- **5** — apply the recommended Pi Zero W PL011 configuration

On the original Pi Zero W, option 5:

- backs up boot configuration
- sets `enable_uart=1`
- adds `dtoverlay=disable-bt`
- removes UART serial-console tokens
- disables `hciuart`
- requires a reboot

Bluetooth is disabled by this configuration; Wi-Fi is not.

After reboot:

```bash
cd ~/ywd-hotspot
readlink -f /dev/serial0
sudo ./lab/mmdvm-diag.sh
```

Expected:

```text
/dev/ttyAMA0
```

## 🧱 What a fresh install does

A genuinely fresh installation:

1. verifies Raspberry Pi hardware and UART mapping
2. performs a read-only MMDVM `GET_VERSION` probe
3. installs build/runtime dependencies
4. creates the restricted `ywd-hotspot` service account
5. clones the pinned MMDVM-Host and DMRGateway sources
6. checks out the exact commits from `pins.env`
7. compiles both with `make -j1`
8. deploys YWD-Hotspot under `/opt/ywd-hotspot/app`
9. installs systemd units, CLI, admin helper, and restricted sudo rules
10. writes non-secret build provenance
11. creates the managed `/opt/ywd-hotspot/repo` checkout when appropriate
12. runs/updates canonical configuration
13. updates the DMR ID database when possible
14. configures persistent journaling
15. starts lightweight side services
16. starts OLED only when configured/detected
17. asks for explicit RF-enable confirmation

> [!NOTE]
> The original Pi Zero W is not exactly a compile monster. The first upstream build can take a while. Normal YWD application updates do not repeat it.

## ⚙️ Canonical configuration

Source of truth:

```text
/etc/ywd-hotspot/config.json
```

Generated outputs:

```text
/etc/ywd-hotspot/MMDVM-Host.ini
/etc/ywd-hotspot/DMRGateway.ini
```

Do **not** hand-maintain generated INI files. Change configuration through YWD-Hotspot and let it regenerate them.

The configuration wizard covers station identity, DMR ID/ESSID, simplex frequency, Color Code, BrandMeister master/security password, location, offsets/levels, WebUI port, OLED behavior, RF boot policy, and journal policy.

## 📡 RF enable confirmation

At the end of a fresh install:

```text
Type ENABLE-RF to start AND enable RF at boot now:
```

Only the exact text `ENABLE-RF` starts/enables the RF path. Any other response leaves MMDVM-Host and DMRGateway stopped/disabled.

That invariant also applies to migration and normal application updates: **source management is never permission to key a transmitter.**

## 🔐 Configure WebUI write control

The dashboard is readable without a write-control session. Configure the local control password with:

```bash
sudo ywd-hotspotctl web-password
```

This password is separate from BrandMeister credentials.

## 🎛️ Configure the BrandMeister API key

Static-TG and Drop-QSO controls use a separate BrandMeister API v2 key:

```bash
sudo ywd-hotspotctl bm-api-key
```

The API key stays on the Pi and is never returned to browser JavaScript.

## ✅ Verify the installation

```bash
ywd-hotspotctl status
ywd-hotspotctl source
```

Expected managed services include:

```text
ywd-mmdvmhost.service
ywd-dmrgateway.service
ywd-dashboard.service
ywd-activity.service
ywd-oled.service
ywd-dmrid-update.timer
```

RF service state depends on the operator's explicit choice.

## 🌐 Open the dashboard

Find the Pi address:

```bash
hostname -I
```

Then browse to:

```text
http://PI-IP:8080/
```

Use the configured port if it differs from `8080`.

> [!CAUTION]
> The built-in dashboard is plain HTTP for a trusted LAN. Do not expose its TCP port directly to the public Internet.

## 🔄 First update check

Once GitHub management is active:

```bash
sudo ywd-hotspotctl update --check
sudo ywd-hotspotctl update --dry-run
```

`--check` only reports. `--dry-run` also stages and validates the candidate without replacing the live app or changing RF service policy.

Before applying updates, read **[UPGRADING.md](UPGRADING.md)**.

## 📟 OLED notes

The installer scans I2C bus 1. The primary test HAT uses an SSD1306-like display at `0x3C`:

```bash
i2cdetect -y 1
```

OLED failure/absence must not interrupt DMR operation.

## 🪵 Known harmless DMRGateway MQTT message

Upstream DMRGateway may attempt a localhost MQTT connection and log connection-refused even though YWD-Hotspot does not require a local MQTT broker.

Do **not** install Mosquitto solely to silence that message.

## 🧰 Troubleshooting

### UART / HAT

```bash
sudo ./lab/mmdvm-diag.sh
```

### BrandMeister / RF stack

```bash
ywd-hotspotctl status
ywd-hotspotctl logs
```

### Dashboard

```bash
systemctl status ywd-dashboard.service --no-pager
journalctl -u ywd-dashboard.service -n 100 --no-pager
```

### GitHub management

```bash
ywd-hotspotctl source
git -C /opt/ywd-hotspot/repo status --short
git -C /opt/ywd-hotspot/repo remote -v
```

Never paste reusable credentials or protected backups into public issues.

## 🗑️ Uninstall

From a repository checkout or installed source copy:

```bash
sudo ./UNINSTALL.sh
```

The uninstaller preserves configuration/runtime data by default so credentials/history are not casually destroyed.

---

**Next:** [🔄 Upgrading](UPGRADING.md) · [📚 Docs index](README.md)
