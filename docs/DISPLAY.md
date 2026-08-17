# 📟 Display + Live DMR Instrumentation

[← Docs index](README.md) · [Project README](../README.md) · [Architecture](ARCHITECTURE.md)

---

YWD-Hotspot keeps display features outside the RF-critical path. The enhanced WebUI instrument panel and OLED runtime screens are optional presentation layers; MMDVM-Host and DMRGateway do not depend on them.

## 🌐 LIVE DMR WebUI modes

The Status page supports two broad behaviors:

- **Basic** — preserves the established lightweight LIVE DMR card and its RX/TX animation.
- **Enhanced instrumentation** — replaces the center of the LIVE DMR card with configurable RF-style gauges and traces rendered in the browser.

Enhanced instrumentation uses the same `/api/status` payload the dashboard already retrieves. It does **not** create a second server polling loop.

### Presets

| Preset | Behavior |
|---|---|
| `basic` | Enhanced instrumentation disabled; current lightweight status UI |
| `balanced` | Signal/quality/TX meters with restrained animation and no rolling traces |
| `instrument` | Signal/quality/TX meters plus RSSI/BER history traces |
| `maximum` | Full meters, traces, peak hold, idle animation, live top-strip details |
| `custom` | Automatically selected after changing individual instrumentation controls |

### Instrumentation controls

Configuration is stored under `display.instrumentation` in the canonical config and includes:

- enable/disable enhanced instrumentation
- segmented or smooth RSSI meter
- configurable RSSI minimum/maximum dBm scale
- configurable signal segment count
- peak hold and hold duration
- BER quality meter and excellent/good/fair thresholds
- TX/RF drive meter
- rolling RSSI and BER histories
- history length
- browser render-rate target: 5, 10, or 20 fps
- animation intensity: off, subtle, normal, or high
- idle animation
- live top status-strip activity details
- numeric values and label density
- reduced-motion policy

### Data honesty

The instrument panel distinguishes measured data from presentation:

- RSSI is shown only when MMDVM activity contains RSSI data.
- BER is shown only when captured from MMDVM activity.
- TX level/RF level are configured drive values, not a measured RF power meter.
- animated RF energy is an activity visualization, **not** an audio VU meter or spectrum analyzer.

When a measurement is unavailable, the UI shows an unavailable/empty state instead of inventing a value.

### Performance behavior

The original Pi Zero W remains the performance budget.

- Basic mode does not initialize rolling history/animation work.
- Enhanced rendering occurs in the browser, not in a new Pi-side daemon.
- The page visibility state is honored so hidden/background tabs do not keep unnecessary animation work running.
- Reduced-motion can follow the browser/OS preference or be forced from YWD settings.

## 📟 OLED architecture

On YWD-Hotspot OS, **`ywd-headless-oled.service` is the sole SSD1306/I2C owner**.

The same unified renderer in `lib/oled.py` is used for runtime display behavior. The legacy `ywd-oled.service` remains disabled on YWD-Hotspot OS so two processes never write the same display concurrently.

Generic/non-OS installs may continue using `ywd-oled.service` because they do not have the headless OS owner.

The OLED renderer is deliberately passive. It may read local config/state and write the SSD1306, but it must not:

- start/stop RF
- change networking
- call BrandMeister APIs
- modify canonical configuration
- become a dependency of MMDVM-Host or DMRGateway

If the OLED process fails, DMR operation should continue normally.

## 🧭 OLED screen priority

The unified daemon uses state priority so operational/recovery information always wins over cosmetic runtime pages:

1. shutdown/status-critical screen
2. first-boot setup/code
3. setup/recovery AP and network failure states
4. software-update progress
5. active RX/TX activity
6. short post-call hold
7. normal idle runtime pages

This preserves the known-good boot/network/setup behavior while adding richer normal-operation screens.

## 🎙️ OLED runtime modes

### Basic

Preserves the established compact status layout.

### Enhanced

Uses a larger auto-fit callsign and configurable live DMR fields during RX/TX.

### Minimal

Prioritizes RX/TX direction, source callsign/DMR ID, and destination with reduced secondary information.

## 🔤 Callsign display

`large_callsign` enables scaled bitmap rendering. `callsign_size` can be:

- `auto`
- `normal`
- `large`
- `huge`

Auto-fit chooses the largest scale that fits the 128×64 panel rather than clipping long callsigns.

If MMDVM activity contains only a numeric DMR ID, the OLED may resolve it from the local RadioID cache. No Internet request is made by the OLED process.

## 📻 Destination / talkgroup display

The OLED can show group or private-call destinations. `talkgroup_format` supports:

- `number`
- `name`
- `name_number`

Talkgroup names are resolved only from the existing local BrandMeister talkgroup cache. If a name is unavailable, the numeric destination remains the fallback.

## 📊 Optional live fields

The runtime display can independently show:

- slot
- elapsed call time
- BER
- RSSI
- network packet loss

Completed-call values may remain visible for `post_call_hold_s` seconds before the display returns to idle.

## 🔄 Rotation

`display.rotation` supports `0` and `180` degrees. Rotation uses SSD1306 controller orientation commands rather than software-rotating every frame.

## 💤 Idle behavior

The existing brightness and display timeout settings remain supported.

Optional idle-page cycling can rotate through compact appliance information such as:

- callsign / RF / BrandMeister state
- Wi-Fi/IP/system status
- recent DMR activity

The cycle is disabled by default so the OLED can remain a stable status display.

## ⬆️ Software-update display

When the WebUI detached updater is active, the OLED may consume the sanitized local update-status file and show the update phase/progress. This is display-only; the OLED does not control the update.

## ⚙️ Canonical configuration

Display settings live under `display` in `/etc/ywd-hotspot/config.json`. Schema 4 adds the runtime OLED and instrumentation controls while preserving existing configurations through normalization/defaulting.

Important defaults are conservative:

```text
OLED runtime mode             basic
WebUI enhanced instruments    disabled
Instrumentation preset        basic
Idle page cycling             disabled
Rotation                      0°
```

An update therefore keeps the existing lightweight presentation until the operator opts into the enhanced modes.

---

**See also:** [🧱 Architecture](ARCHITECTURE.md) · [🔄 Upgrading](UPGRADING.md)
