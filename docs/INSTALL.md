# Installing YWD-Hotspot from GitHub

This document covers a fresh source installation of YWD-Hotspot on the project's primary test target: an original Raspberry Pi Zero W with a simplex MMDVM HAT.

## 1. Hardware and OS baseline

Current development baseline:

```text
Raspberry Pi Zero W Rev 1.1
Raspberry Pi OS Lite 32-bit / Raspbian 13 (trixie)
MMDVM_HS_Hat / JumboSpot-style simplex board
UART: /dev/serial0 at 115200
Pi Zero W expected mapping: /dev/serial0 -> /dev/ttyAMA0
OLED: I2C bus 1, normally 0x3C
```

Before installing, make sure the Pi has working networking/SSH and the MMDVM HAT has a suitable antenna attached before RF is enabled.

Useful preflight commands:

```bash
cat /etc/os-release
uname -a
uname -m
ls -l /dev/serial0 2>/dev/null || true
readlink -f /dev/serial0 2>/dev/null || true
```

## 2. Clone the repository

Install Git first if this is a fresh OS image, then replace `OWNER` with the actual GitHub account or organization:

```bash
sudo apt update
sudo apt install -y git
cd ~
git clone https://github.com/OWNER/ywd-hotspot.git
cd ywd-hotspot
```

If Git checked the repository out with non-executable script permissions, normalize them before continuing:

```bash
chmod +x INSTALL.sh UPDATE.sh UNINSTALL.sh
chmod +x bin/ywd-hotspotctl lab/mmdvm-diag.sh
chmod +x lib/*.py
```

The repository also includes `.gitattributes` to keep shell/Python/text sources on LF line endings. This matters because CRLF shell scripts are a wonderfully stupid way to turn a five-minute install into an hour of swearing.

## 3. Verify the UART and modem

Run the hardware utility:

```bash
sudo ./lab/mmdvm-diag.sh
```

Option **1** runs the complete read-only diagnostic set. Option **2** performs only the MMDVM firmware probe.

On the original Pi Zero W the target mapping is:

```text
/dev/serial0 -> /dev/ttyAMA0
```

If that mapping is not present, option **5** can apply the recommended PL011 configuration. It:

- backs up the Pi boot configuration
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
```

Then run the diagnostic probe again if desired.

## 4. Run the installer

```bash
cd ~/ywd-hotspot
sudo ./INSTALL.sh
```

The script self-elevates through `sudo` when needed.

A fresh installation performs these high-level actions:

1. verifies Raspberry Pi hardware
2. verifies `/dev/serial0` and the expected Pi Zero W UART mapping
3. sends a read-only MMDVM `GET_VERSION` probe
4. installs build/runtime packages through `apt`
5. creates the restricted `ywd-hotspot` service account
6. clones MMDVM-Host and DMRGateway into `/opt/ywd-hotspot/src`
7. checks out the exact commits in `pins.env`
8. compiles both upstream programs with `make -j1`
9. installs YWD-Hotspot under `/opt/ywd-hotspot/app`
10. installs systemd units, the CLI, admin helper and restricted sudo policy
11. runs the configuration wizard
12. performs an initial DMR ID update when Internet access is available
13. configures persistent journaling according to the canonical config
14. starts the activity/dashboard services
15. starts the OLED service only if it is enabled and detected
16. asks for explicit RF-enable confirmation

The original Pi Zero W is not exactly a compile farm. Expect the first MMDVM-Host/DMRGateway build to take noticeably longer than the YWD application install itself.

## 5. Configuration wizard

The CLI wizard collects the primary station/network settings, including:

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

The canonical file is then written to:

```text
/etc/ywd-hotspot/config.json
```

Generated runtime files are:

```text
/etc/ywd-hotspot/MMDVM-Host.ini
/etc/ywd-hotspot/DMRGateway.ini
```

Do not hand-maintain the generated INI files. Change the canonical configuration through the CLI/web backend and let YWD-Hotspot regenerate them.

## 6. RF enable confirmation

At the end of a fresh install the installer prints an RF warning and asks:

```text
Type ENABLE-RF to start AND enable RF at boot now:
```

Only the exact text `ENABLE-RF` starts and enables MMDVM-Host/DMRGateway. Any other response leaves the RF path stopped and disabled.

This is intentional. Updates and installs must never unexpectedly put a transmitter on the air.

## 7. Configure local web control

The status dashboard is readable without control login, but write/admin operations remain locked until a local control password is configured:

```bash
sudo ywd-hotspotctl web-password
```

This password is separate from BrandMeister credentials.

## 8. Configure the BrandMeister API key

The RF/network connection uses the Hotspot Security password from the canonical config. Dashboard API controls use a separate BrandMeister API v2 key.

Set it with:

```bash
sudo ywd-hotspotctl bm-api-key
```

The key remains server-side on the Pi and is not returned to browser JavaScript.

## 9. Verify services

```bash
ywd-hotspotctl status
```

Expected services include:

```text
ywd-mmdvmhost.service
ywd-dmrgateway.service
ywd-dashboard.service
ywd-activity.service
ywd-oled.service
ywd-dmrid-update.timer
```

Whether MMDVMHost/DMRGateway are active depends on whether RF was explicitly enabled.

For more detail:

```bash
ywd-hotspotctl health
ywd-hotspotctl logs
sudo systemctl --no-pager --full status ywd-dashboard.service
```

## 10. Open the dashboard

Find the Pi address:

```bash
hostname -I
```

Then browse to:

```text
http://PI-IP:8080/
```

If you chose another dashboard port, use that port instead.

The dashboard is intentionally plain HTTP. Keep it on a trusted LAN and do not forward the port directly to the Internet.

## 11. OLED notes

The installer scans I2C bus 1. The current primary HAT uses an SSD1306-like display at `0x3C`.

Check manually with:

```bash
i2cdetect -y 1
```

If no display is detected, the OLED service can remain disabled without affecting DMR operation.

## 12. Known harmless DMRGateway MQTT message

Upstream DMRGateway may attempt a localhost MQTT connection and log a connection-refused message even though YWD-Hotspot does not depend on a local MQTT broker. Do not install Mosquitto solely to silence that message.

## 13. Fresh-install troubleshooting

If `/dev/serial0` is missing or maps incorrectly:

```bash
sudo ./lab/mmdvm-diag.sh
```

Use option 5, reboot, and retry the installer.

If the modem probe fails, stop and fix the UART/HAT issue rather than forcing the install.

If BrandMeister does not connect after RF is enabled:

```bash
ywd-hotspotctl status
ywd-hotspotctl logs
```

Verify the master, DMR ID/ESSID and Hotspot Security password. Do not paste reusable credentials into public GitHub issues.

If the dashboard is unavailable:

```bash
systemctl status ywd-dashboard.service --no-pager
journalctl -u ywd-dashboard.service -n 100 --no-pager
```

## 14. Uninstall

From a repository checkout or installed source copy:

```bash
sudo ./UNINSTALL.sh
```

The uninstaller removes YWD-Hotspot services/binaries but intentionally keeps `/etc/ywd-hotspot` and `/var/lib/ywd-hotspot` by default so credentials/history are not casually destroyed.
