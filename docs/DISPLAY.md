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
| `instrument` | Signal/quality/TX meters plus sample-based RSSI/BER history traces |
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
- post-call measurement hold
- RSSI and BER histories
- sample-count history or time-window history
- maximum sample age
- browser render-rate target: 5, 10, or 20 fps
- animation intensity: off, subtle, normal, or high
- idle animation
- live top status-strip activity details
- numeric values and label density
- reduced-motion policy

## 📡 RX behavior and measurement timing

The normal YWD activity collector intentionally follows the existing MMDVM-Host journal rather than adding another telemetry service.

During an active **RF → hotspot** call, the enhanced panel therefore shows:

```text
RX FROM RADIO
SIGNAL   SAMPLING…
QUALITY  MEASURING…
```

When MMDVM-Host writes the completed RF-call summary, YWD-Hotspot receives the measured average RSSI and BER. The gauges then populate with the real completed-call values and may remain on screen for `measurement_hold_s` seconds.

This avoids displaying a fake live signal value simply to make the meter move.

### Why not display MMDVM-Host's internal ~1-second values?

The pinned MMDVM-Host build does internally accumulate RSSI and BER in roughly 1.08-second intervals during RF receive. Its live JSON RSSI/BER output, however, is emitted through MMDVM-Host's optional MQTT path rather than the normal journal stream used by YWD-Hotspot.

YWD-Hotspot deliberately does **not** add an MQTT broker/client stack to the original Pi Zero merely to animate two gauges. The current appliance therefore uses the lightweight journal collector and honest completed-call measurements. A future telemetry path can be considered if it remains similarly lightweight and does not alter the RF stability baseline.

## 📤 TX behavior

During **network → RF** transmission there is no incoming RF RSSI to measure, so the enhanced panel does not show an empty RX signal gauge as though something were broken.

TX mode instead prioritizes:

- configured TX/DMR level
- configured RF level
- source and destination
- slot / elapsed time
- network quality state

While the transmission is active, network quality is shown as **PENDING**. Once MMDVM-Host reports the completed network transmission, packet loss and BER are shown when available.

TX Level and RF Level are configured drive values, **not measured RF output power**.

## 📈 History modes

RSSI/BER history uses completed RF measurements only.

### Last samples

The recommended/default mode keeps the last N completed RF measurements up to a configurable maximum age:

```text
history_mode       samples
history_samples    20
history_max_age_s  900
```

This is useful on a quiet hotspot because a good sample does not disappear merely because 30 seconds passed with no traffic.

### Time window

Time mode retains completed RF samples within a configured number of seconds:

```text
history_mode       time
history_seconds    60
```

Both modes remain bounded and browser-side.

## 🔐 Strict CSP behavior

The dashboard retains its restrictive `style-src 'self'` Content Security Policy. Alpha12.1 removes the remaining Talkgroup Manager `<style>` injection and avoids JavaScript `style.width` / `style.height` updates for instrument and update-progress bars.

Dynamic meter levels are represented with bounded `data-*` states and styled by same-origin external CSS. YWD-Hotspot does **not** enable `unsafe-inline` to make the gauges work.

## 🎛️ Data honesty

The instrument panel distinguishes measured data from presentation:

- RSSI is shown only when MMDVM activity contains RSSI data.
- BER is shown only when captured from MMDVM activity.
- active RX explicitly says sampling/measuring until the completed-call values arrive.
- TX/RF levels are configured drive values, not a wattmeter.
- network packet-loss/BER values appear when the completed network call reports them.
- animated RF energy is an activity visualization, **not** an audio VU meter or spectrum analyzer.

## ⚡ Performance behavior

The original Pi Zero W remains the performance budget.

- Basic mode does not initialize rolling-history/animation work.
- Enhanced rendering occurs in the browser, not in a new Pi-side daemon.
- Enhanced mode reuses the dashboard status payload instead of adding another Pi polling loop.
- History arrays are small and bounded.
- Render-rate choices are 5, 10, or 20 fps.
- Reduced-motion can follow the browser/OS preference or be forced from YWD settings.
- No MQTT broker, SQL database, Node runtime, or chart framework is required.

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

## 📊 Optional OLED live fields

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

The WebUI progress modal also uses same-origin CSS-driven progress states and reconnects after the intentional dashboard restart. Brief browser `ERR_CONNECTION_REFUSED` messages during that restart are expected; the detached update continues outside the dashboard process.

## ⚙️ Canonical configuration

Display settings live under `display` in `/etc/ywd-hotspot/config.json`. Schema 5 adds the measurement-hold and history-mode controls while preserving earlier display settings through normalization/defaulting.

Important defaults remain conservative:

```text
OLED runtime mode             basic
WebUI enhanced instruments    disabled
Instrumentation preset        basic
Instrument history mode       samples
Instrument history samples    20
Instrument sample max age     900 sec
Measurement hold              5 sec
Idle page cycling             disabled
Rotation                      0°
```

An update therefore keeps the lightweight presentation until the operator opts into enhanced modes.

---

**See also:** [🧱 Architecture](ARCHITECTURE.md) · [🔄 Upgrading](UPGRADING.md)
