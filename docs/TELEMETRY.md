# 📡 MMDVM Telemetry Bus

[Documentation index](README.md) · [Plugin framework](PLUGINS.md) · [Display + instrumentation](DISPLAY.md) · [Architecture](ARCHITECTURE.md)

The Alpha17 `dev-plugins` line adds a passive MMDVM telemetry path for first-party plugins. Its first consumer is the **MMDVM Live Telemetry** package. Alpha17.1 adds the proven MMDVM_HS RSSI normalization needed for real receive-signal values on supported ADF7021 hotspot firmware.

This layer is intentionally separate from RF ownership. A telemetry plugin may observe validated MMDVM state, but it does not own the modem serial port, change RF mode, transmit, or receive arbitrary network access.

## Data path

```text
MMDVM-Host
   │ structured MQTT JSON
   ▼
127.0.0.1:18883
YWD loopback Mosquitto
   │
   ▼
ywd-mmdvm-telemetry.service
trusted YWD bridge
   │ sanitized schema-1 snapshot
   ▼
/run/ywd-hotspot-telemetry/telemetry.json
   │ read-only observation
   ├──────────────► trusted WebUI endpoint
   │
   └──────────────► sandboxed MMDVM Live Telemetry plugin
                    (no IP sockets / no RF device access)
```

The broker and bridge are trusted appliance infrastructure. The plugin remains under the existing shared `ywd-plugin@.service` sandbox.

## MMDVM-Host configuration

YWD-Hotspot generates an explicit local MQTT target in `MMDVM-Host.ini`:

```ini
[MQTT]
Host=127.0.0.1
Port=18883
Auth=0
Keepalive=60
Name=ywd-mmdvm
```

Alpha17.1 also generates the MMDVM_HS RSSI mapping path in the modem section:

```ini
[Modem]
RSSIMappingFile=/etc/ywd-hotspot/mmdvm-hs-rssi.dat
```

The pinned MMDVM-Host publishes structured JSON to the `json` topic beneath its configured name, so the YWD bridge subscribes to:

```text
ywd-mmdvm/json
```

The existing `MQTTLevel=0` log setting remains unchanged; telemetry uses MMDVM-Host's structured JSON publisher rather than turning on verbose MQTT logging.

## MMDVM_HS RSSI normalization

Supported MMDVM_HS ADF7021 firmware with `SEND_RSSI_DATA` reports the **positive magnitude** of received dBm in the extra RSSI bytes appended to RF frames. For example, a firmware value of `62` represents approximately `-62 dBm`.

YWD therefore generates this normalization file:

```text
# YWD-Hotspot MMDVM_HS RSSI mapping
0 0
255 -255
```

MMDVM-Host linearly interpolates that mapping, so `57 → -57 dBm`, `62 → -62 dBm`, and so on. This is not a guessed RF calibration curve and it does not manufacture RSSI when firmware does not supply RSSI bytes. A firmware build without `SEND_RSSI_DATA` will continue to report RSSI as unavailable.

The generated map lives at `/etc/ywd-hotspot/mmdvm-hs-rssi.dat`, is regenerated with the upstream INI files, and is readable by the unprivileged `ywd-hotspot` MMDVM-Host service account.

Physical validation on the reference hotspot produced raw/report pairs such as `62/-62 dBm` and `57/-57 dBm`, with an RF call summary of `-66/-47/-57 dBm` (minimum/maximum/average). This confirmed the normalization contract without changing modem firmware or RF calibration.

## Broker boundary

YWD does **not** use the normal public MQTT port for this feature.

The bundled broker configuration is:

```text
listener 18883 127.0.0.1
allow_anonymous true
persistence false
```

The listener is bound only to IPv4 loopback and the systemd unit also applies localhost-only network policy. There is no LAN/WAN telemetry listener.

If Mosquitto is already installed by the operator, YWD does not take ownership of or disable that existing broker. If YWD has to install the broker package itself, the distro default service is disabled and the dedicated `ywd-mqtt.service` owns only the YWD loopback listener.

Removing YWD-Hotspot removes the YWD-owned broker/bridge units but deliberately leaves the Mosquitto OS packages installed. Package removal is never used as a cleanup shortcut for potentially shared software.

## Trusted bridge

`ywd-mmdvm-telemetry.service` runs as the unprivileged `ywd-hotspot` account. It is allowed loopback IP access only because it is trusted core, not plugin code.

The bridge accepts only known structured envelopes needed by this phase:

- `MMDVM`
- `RSSI`
- `BER`
- `Text`
- `DMR`

Unknown message families are ignored instead of being copied blindly into plugin-visible state.

The bridge writes one bounded runtime snapshot under:

```text
/run/ywd-hotspot-telemetry/telemetry.json
```

This is a dedicated tmpfs runtime directory. It is intentionally separate from `/run/ywd-hotspot`, which remains owned by the existing live activity collector.

The snapshot is recreated at boot and contains no plugin configuration or credentials.

## DMR telemetry exposed in Alpha17

The first bridge schema exposes enough information to prove the framework:

- current MMDVM mode
- latest structured RSSI sample
- latest structured BER sample
- DMR source ID / resolved source info when MMDVM-Host provides it
- destination ID
- group/private indicator
- time slot
- RF vs network source
- DMR start / late-entry / end / lost / timeout-style state
- completed-call duration, BER, loss, and RSSI summary when supplied upstream
- bridge heartbeat, message count, parser error count, and last-payload age

RSSI is an RF-receive measurement. A network-originated transmission does not magically gain a local RF RSSI value; UI consumers should treat the RSSI/BER samples as measurements with their own age/source semantics rather than synthetic signal data.

## MMDVM Live Telemetry plugin

The Alpha17 package is shipped as:

```text
mmdvm-live-telemetry
```

After an Alpha17 application update it must appear as **AVAILABLE**, not automatically installed. This is deliberate: Alpha17 exercises the Alpha16 package lifecycle with a real new package.

Expected progression:

```text
AVAILABLE
   ↓ INSTALL
INSTALLED + DISABLED
   ↓ ENABLE
ACTIVE
```

Its declared requirements are:

```text
python3
systemd
journalctl
mmdvm-host
mosquitto-broker
mosquitto-client
mmdvm-serial hardware
```

The package declares `rf_mode=false` and the capability `read:mmdvm-telemetry`. Its service still has only `AF_UNIX` available through the shared plugin template.

## WebUI behavior

When the package is installed and enabled, Plugin Manager shows a **LIVE MMDVM TELEMETRY** panel with:

- bridge state
- MMDVM mode
- RSSI
- BER
- active DMR source/destination/slot/source
- payload age
- received message count

The browser polls the lightweight sanitized telemetry endpoint once per second only while the Plugins page is visible. The polling path does not invoke `systemctl` and does not parse the MMDVM journal.

## Update and boot behavior

The local broker and trusted bridge are appliance infrastructure and are enabled at boot once Alpha17 successfully provisions their dependencies.

MMDVM-Host is ordered after the local broker. During the first Alpha17 update, MMDVM-Host may already have started before Mosquitto is installed; the telemetry runtime therefore performs one controlled MMDVM restart after the broker is available so the MQTT connection is opened immediately.

If RF was active, DMRGateway is stopped around that restart and restored afterward. Gateway restoration is attempted even if the MMDVM restart fails.

Telemetry dependency setup is fail-soft: failure to install/start the passive telemetry transport does not intentionally roll back an otherwise successful core application update. The Plugin Manager dependency/bridge state then exposes what is missing for repair.

When leaving `dev-plugins` for plugin-free `dev` or `main`, the current plugin-aware transition helper stops/removes the YWD telemetry units together with the plugin runtime. The Mosquitto package remains installed/inert.

## Physical Alpha17 test checklist

After updating a known-good Alpha16.1 hotspot:

1. Verify normal DMR, BrandMeister, dashboard, and OLED operation first.
2. Confirm these are active:

   ```bash
   systemctl is-active ywd-mqtt.service
   systemctl is-active ywd-mmdvm-telemetry.service
   ```

3. Confirm the broker is loopback-only:

   ```bash
   sudo ss -ltnp | grep 18883
   ```

   Expected listener: `127.0.0.1:18883` only.

4. Inspect the sanitized bridge snapshot:

   ```bash
   sudo python3 -m json.tool /run/ywd-hotspot-telemetry/telemetry.json
   ```

5. In Plugin Manager, verify **MMDVM Live Telemetry** starts as **AVAILABLE**.
6. Run **CHECK DEPENDENCIES** and **CHECK HARDWARE**.
7. **INSTALL** it. It must remain disabled/inactive.
8. **ENABLE** it. The service and live telemetry panel should become active.
9. Key the local radio into the hotspot and verify live DMR source/destination plus RSSI/BER updates.
10. Receive a network-originated DMR call and verify source/destination activity without treating stale RF RSSI as a new network measurement.
11. Test **TEST**, **LOGS**, STOP/START/RESTART runtime controls, disable/enable, and plugin uninstall/reinstall.
12. Reboot and verify an enabled telemetry plugin returns automatically while the core hotspot remains healthy.

Useful diagnostic block:

```bash
echo '===== TELEMETRY CORE ====='
systemctl is-active ywd-mqtt.service
systemctl is-active ywd-mmdvm-telemetry.service

echo
echo '===== TELEMETRY PLUGIN ====='
systemctl is-active 'ywd-plugin@mmdvm-live-telemetry.service' || true
systemctl is-enabled 'ywd-plugin@mmdvm-live-telemetry.service' || true

echo
echo '===== LOOPBACK LISTENER ====='
sudo ss -ltnp | grep 18883 || true

echo
echo '===== SNAPSHOT ====='
sudo python3 -m json.tool /run/ywd-hotspot-telemetry/telemetry.json 2>/dev/null || true

echo
echo '===== RSSI MAPPING ====='
grep -n 'RSSIMappingFile' /etc/ywd-hotspot/MMDVM-Host.ini || true
cat /etc/ywd-hotspot/mmdvm-hs-rssi.dat 2>/dev/null || true

echo
echo '===== CORE DMR ====='
systemctl is-active ywd-mmdvmhost.service
systemctl is-active ywd-dmrgateway.service
systemctl is-active ywd-dashboard.service

echo
echo '===== FAILURES ====='
systemctl --failed --no-pager
```

## Why this exists before an RF-control plugin

The telemetry bus deliberately proves several hard problems first:

- structured MMDVM data ingestion
- explicit capability declaration
- safe privileged/core-to-plugin boundary
- package dependency + hardware checks
- service lifecycle
- reboot/update behavior
- low-overhead live WebUI data
- fail-closed plugin activation

A future MMDVM control or RF-mode plugin can build on this observation layer instead of inventing a second telemetry path or asking every plugin for raw modem/network access.

That future phase still requires a separate ownership/arbitration design before any plugin is allowed to reconfigure or control the MMDVM RF path.
