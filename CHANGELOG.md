# 🗒️ Changelog

[Project README](README.md) · [Docs](docs/README.md) · [Development notes](docs/GITHUB-SETUP.md)

YWD-Hotspot is still alpha software. These are project checkpoints, not a promise of strict semantic-versioning stability.

---

## 0.1.0-alpha15-dev — Plugin Update + Rollback Safety

**Status:** `dev-plugins` test build layered on the physically proven Alpha14 service-plugin checkpoint. No MMDVM-Host, DMRGateway, RF config, OLED, or normal DMR-service changes are included.

Highlights:

- new trusted `plugin_update_safety.py` transaction helper
- plugin-aware updates capture master state, per-plugin activation state, and exact service runtime/boot state
- all YWD plugin services are quiesced before application files are replaced
- successful `dev-plugins` updates restore only plugins that still validate in the new target runtime
- newly introduced plugins remain disabled until explicitly enabled
- service runtime/boot distinctions are preserved across updates, including intentionally runtime-stopped but boot-enabled plugins
- failed service-state restoration leaves that plugin stopped/disabled and clears its activation flag
- plugin controls refuse state/config/lifecycle writes while the application update lock is held
- core updater rollback remains unchanged; the wrapper repairs the restored split admin/update bridge and then restores pre-update plugin runtime
- leaving `dev-plugins` for a plugin-free target is handled by the currently installed plugin-aware GitHub updater before target handoff
- successful transition to a plugin-free target clears plugin activation state and removes the generic `ywd-plugin@.service` template while retaining inert plugin config files
- failed cross-branch updates restore the old app/config, split admin bridge, and prior plugin service runtime
- future `dev-plugins` candidate validation requires the service/update-safety payload

## 0.1.0-alpha14-dev — Sandboxed Service Plugin Phase

**Status:** physically tested successfully on the Pi Zero and preserved at `dev-plugins-alpha14-known-good`. WebUI remained responsive and normal DMR/BM behavior remained intact.

Highlights:

- first service-backed plugin model using a single trusted `ywd-plugin@.service` template
- restrictive systemd sandbox with no RF/device ownership, Linux capabilities, or normal network sockets
- per-plugin enable/disable with systemd boot activation
- START / STOP RUNTIME / RESTART lifecycle controls
- service runtime + boot state displayed separately in the WebUI
- plugin journal viewing and health/test actions
- harmless `service-heartbeat` reference plugin with configurable label/interval
- master kill switch stops/disables service plugins and clears activation state
- service plugin state survives reboot when explicitly enabled
- service status is queried on Plugin Manager refresh rather than through another background DMR-status polling loop

## 0.1.0-alpha13.1-dev — Plugin Master-Switch Safety Polish

**Status:** physically tested successfully and preserved at `dev-plugins-alpha13.1-known-good`.

Highlights:

- custom YWD confirmation modal for master and individual plugin disable actions
- master OFF now clears all per-plugin activation state instead of leaving an `ARMED` state
- individual lifecycle/test controls are inert while the subsystem is disabled
- re-enabling the master switch never silently reactivates previous plugins
- existing Alpha13 master-off/armed state normalizes fail-closed

## 0.1.0-alpha13-dev — Plugin Framework v1

**Status:** first `dev-plugins` framework test build. The stable unified app/OS baseline remains preserved at `dev-alpha12.2-os-integrated-known-good`. No MMDVM-Host or DMRGateway pin changes are included.

Highlights:

- trusted core **PLUGINS** WebUI section
- global plugin-subsystem master enable/disable control
- globally disabled by default when no plugin state file exists
- installed/enabled/active plugin counts and health display
- strict first-party manifest + configuration-schema validation
- per-plugin enable/disable state
- schema-rendered per-plugin configuration with isolated files under `/etc/ywd-hotspot/plugins/`
- plugin subsystem state stored separately at `/etc/ywd-hotspot/plugin-state.json`
- plugin state/config automatically ride inside the existing protected `/etc/ywd-hotspot` update backup
- narrow authenticated WebUI actions for plugin system state, plugin state, and plugin configuration
- existing root-owned admin dispatcher remains the only privilege boundary; there is no arbitrary plugin sudo command
- future `dev-plugins` candidates validate the Plugin API v1 payload before live installation
- switching back to plain `dev`/`main` remains supported; stable targets are not required to contain experimental plugin files

Plugin API v1 safety boundary:

- declarative packages only
- no plugin Python import/execution
- no plugin JavaScript/CSS injection
- no plugin services
- no RF-mode ownership
- RF-mode manifests are rejected
- service-backed manifests are rejected
- unsupported/unknown manifest fields or capabilities fail closed
- Plugin Manager remains available even when plugin support itself is disabled

Reference package:

- bundled `system-info` plugin exercises discovery, validation, master enable/disable, per-plugin enable/disable, configuration persistence, status data, and controlled test flow
- its provider is implemented by trusted core and cannot control RF, BrandMeister, systemd, networking, OLED, or privileged commands

Documentation:

- `docs/PLUGINS.md` records the v1 contract and later service/RF-plugin safety requirements
- source manifest tracks the Plugin Manager, admin bridge, WebUI assets, and reference package

## 0.1.0-alpha12.3-dev — Persistent dev-plugins Update Channel

Added `dev-plugins` as a persistent GitHub update channel across the CLI, managed checkout, detached WebUI updater, and About-page software-update UI. This is the bootstrap build used to move a physically tested unified Alpha12.2 appliance onto the isolated plugin-development line without reflashing.

## 0.1.0-alpha12.2-dev — Unlock + Update Feedback Polish

**Status:** active `dev` test build. `0.1.0-alpha12.1-dev` is preserved at `dev-alpha12.1-known-good`. No MMDVM-Host or DMRGateway pin changes are included.

Highlights:

- wrong WebUI unlock passwords now report the failure inside the UNLOCK CONTROLS modal instead of behind it as a toast
- failed unlock attempts clear the password field and refocus it for the next attempt
- unlock submission shows a CSP-safe `CHECKING…` spinner/busy state while authentication is in flight
- the final About-page `INSTALL UPDATE` button immediately changes to a CSP-safe `STARTING…` spinner state while `/api/update/start` launches the detached updater
- update-start feedback hands off to the existing progress modal as soon as the detached update job becomes visible
- modal error/busy presentation remains external-CSS based; strict `style-src 'self'` is unchanged
- Alpha12.2 cache-busts the updated polish assets

## 0.1.0-alpha12.1-dev — Instrument Panel + CSP Polish

**Status:** user-tested successfully on mobile and desktop browsers and preserved at `dev-alpha12.1-known-good`. No MMDVM-Host or DMRGateway pin changes are included.

Highlights:

- canonical configuration schema 5
- RX and TX now use different instrument layouts based on measurements the hotspot can honestly provide
- active RF receive shows `SAMPLING…` / `MEASURING…` until MMDVM-Host reports the completed-call RSSI/BER values
- completed RX RSSI/BER can remain visible for a configurable measurement-hold period
- network → RF TX hides meaningless RX signal/BER gauges and prioritizes configured TX Level / RF Level
- TX network quality is `PENDING` during the call and displays completed packet-loss/BER data when available
- history defaults to the last completed RF samples instead of losing useful values after a short quiet period
- configurable sample count, maximum sample age, or time-window history mode
- all instrument meter levels are rendered with bounded `data-*` states and same-origin CSS rather than JavaScript inline styles
- Talkgroup Manager no longer injects a runtime `<style>` element
- update progress bar no longer changes `style.width`; strict `style-src 'self'` remains unchanged
- removed the explanatory “Progress is stage-driven…” line from the update modal
- WebUI assets use Alpha12.1 cache-busting versions
- `docs/DISPLAY.md` documents measurement timing, TX/RX semantics, schema 5, CSP behavior, and history modes

Telemetry note:

- the pinned MMDVM-Host internally accumulates RF RSSI/BER at roughly 1.08-second intervals
- its live JSON RSSI/BER telemetry is published through the optional MQTT path rather than the journal stream YWD-Hotspot currently consumes
- Alpha12.1 deliberately does not add an MQTT broker/client dependency to the original Pi Zero merely to animate gauges
- the lightweight activity collector therefore continues using honest completed-call journal measurements

## 0.1.0-alpha12-dev — Live DMR Instrument Panel + Unified OLED

**Status:** superseded by Alpha12.1 after initial Pi/browser testing. No MMDVM-Host or DMRGateway pin changes are included.

Highlights:

- canonical configuration schema 4
- existing schema-3 configs normalize forward with conservative display defaults
- established Basic LIVE DMR status card remains the default/low-overhead mode
- optional browser-side LIVE DMR instrument panel
- segmented or smooth RSSI gauge with configurable dBm scale and segment count
- BER quality gauge with configurable excellent/good/fair thresholds
- configured TX/RF drive meters
- peak hold and configurable hold duration
- rolling RSSI/BER SVG history traces
- configurable 5/10/20 fps browser rendering target
- off/subtle/normal/high animation settings and reduced-motion policy
- Basic, Balanced, Instrument, Maximum Shiny, and Custom presets
- enhanced panel reuses the existing dashboard status payload; no second server polling loop
- unavailable RSSI/BER remains unavailable rather than being synthesized
- dynamic top status-strip RX/TX detail option

OLED/runtime display:

- one shared `lib/oled.py` renderer for generic installs and YWD-Hotspot OS
- YWD-Hotspot OS keeps `ywd-headless-oled.service` as the sole physical SSD1306/I2C owner
- `ywd-oled.service` remains disabled on the appliance OS
- owner transition is serialized during OLED-affecting config apply/revert and manual restart
- existing boot/network/setup/recovery/shutdown screens retained
- Basic / Enhanced / Minimal runtime display modes
- large auto-fit callsign rendering
- group/private destination display
- optional cached talkgroup name display
- local RadioID callsign fallback without OLED-originated Internet requests
- slot, elapsed, BER, RSSI, and packet-loss toggles
- configurable post-call hold
- optional idle-page cycling
- SSD1306 hardware 0° / 180° rotation
- update-progress display from the local sanitized update-status file
- OLED remains a passive presentation service outside the RF-critical path

Update/build safety:

- dashboard explicitly serves instrumentation JS/CSS assets
- GitHub candidate manifest requires instrumentation and unified-OLED payload
- install/update wrappers preflight unified OLED and instrumentation files before live service work
- uninstall restores the OS headless OLED command/drop-in state
- display-only configuration changes do not touch the RF stack
- instrumentation-only configuration changes are treated as dashboard presentation changes

Documentation:

- `README.md` refreshed for Alpha12
- `docs/DISPLAY.md` added
- architecture and upgrading docs updated for single OLED ownership, display schema, and WebUI updater/progress behavior

## 0.1.0-alpha11.2-dev — Stage-Driven Update Progress

Added a WebUI software-update progress modal driven by real updater milestones rather than a fake elapsed timer. The detached updater publishes sanitized phase/progress/message state and the browser survives dashboard restart/reconnect during installation.

## 0.1.0-alpha11-dev / alpha11.1-dev — About-Page Self Update

Introduced authenticated About-page update checking/installation, a detached `ywd-update.service`, narrow update admin actions, pending-config/dirty-source guards, managed-refspec repair for legacy single-branch OS checkouts, and the first physically successful WebUI self-update test.

## 0.1.0-alpha10-dev — GitHub + UX Polish

Highlights:

- README reorganized into a proper GitHub project front door
- documentation index added under `docs/README.md`
- installation/migration/update instructions refreshed and shortened
- normal Git-clone install no longer tells users to chmod already-executable repository files
- `main` / `dev` / checkpoint branch model documented consistently
- stale Alpha6-era status text removed from Security/Contributing/development docs
- GitHub-friendly callouts, tables, navigation links, icons, and collapsible CLI reference
- same-origin `ui-polish.css` added so visual polish remains compatible with strict CSP
- success/error toasts get clearer visual hierarchy
- subtle modal open/close motion with `prefers-reduced-motion` support
- async action buttons show a small spinner/working label while requests are pending
- Talkgroup Manager helper styles moved into the CSP-approved external polish stylesheet path
- updater candidate validation now requires the new polish stylesheet

No MMDVM-Host or DMRGateway pin changes are included.

## 0.1.0-alpha9.2-dev — Modal CSP Fix + Polish Checkpoint

**Status:** user-tested successfully on the Pi Zero/mobile WebUI; checkpointed at `dev-alpha9.2-known-good`.

Highlights:

- custom YWD confirmation dialogs confirmed working on mobile
- modal implementation reuses the dashboard's existing CSP-approved `.modal` / `.dialog` primitives
- no `unsafe-inline` CSP weakening
- Alpha9.1 fixed the missing `/ui-polish.js` HTTP route
- Alpha9.1 also fixed deployment of the split installer/updater/CLI core files
- Alpha9.2 fixed the remaining modal-style CSP conflict
- console branding/color remained working through both hotfixes

## 0.1.0-alpha9-dev — Console + UI Polish

Introduced:
- shared lightweight terminal presentation helper in `bin/ywd-ui.sh`
- ANSI cyan/blue/magenta/green/yellow/red output matching the WebUI palette
- automatic plain output when stdout is redirected or `NO_COLOR` is set
- RF-themed YWD-Hotspot / KJ6YWD ASCII banners for installer/updater/migration entry points
- themed `ywd-hotspotctl` control-console menu
- colorized status/source/health/calibration presentation
- themed browser confirmation layer for RF/reboot/config/calibration/TG actions
- existing browser `beforeunload` warning intentionally left native

## 0.1.0-alpha8-dev — Talkgroup Manager

**Status:** user-tested successfully before Alpha9; checkpoint retained as `dev-alpha8-known-good`.

Highlights:

- dedicated **TALKGROUPS** WebUI page
- live BrandMeister static/dynamic subscription display
- BrandMeister v2 TG directory search by ID/name
- normalized Pi-side directory cache with 24-hour normal lifetime
- stale-cache fallback
- manual directory refresh from unlocked control mode
- desired static-TG plan separate from live BM state
- explicit add/remove preview and confirmation
- additions applied before removals
- browser-local favorites and saved static sets
- existing authenticated BrandMeister API controls reused
- `docs/TALKGROUPS.md` added

## 0.1.0-alpha7-dev — Dev Channel + Guided RX Calibration

**Status:** user-tested successfully before Alpha8; checkpoint retained as `dev-alpha7-known-good`.

Highlights:

- persistent `main` / `dev` update channels
- successful explicit `--branch main|dev` updates remember the selected channel
- channel displayed in CLI/WebUI provenance
- terminal calibration summary + JSON/CSV export
- repeated RXOffset samples grouped by offset
- average BER, best BER, average RSSI, and sample count
- three samples per offset required before supported recommendation
- provisional best shown below the sample threshold
- confirmation-gated **USE BEST RX OFFSET**
- ±500 Hz quick adjustment controls

The recommendation uses average BER and does not silently change modem settings.

## 0.1.0-alpha6 — GitHub Integration + About

`main` currently remains on the Alpha6 line while later work is exercised on `dev`.

Highlights:

- WebUI About page with project branding/links/author credit
- branch/ref/commit/source provenance
- `/etc/ywd-hotspot/build-info.json`
- managed source checkout at `/opt/ywd-hotspot/repo`
- deployed runtime at `/opt/ywd-hotspot/app`
- `ywd-hotspotctl source`
- `update --check`, `--dry-run`, branch/tag support
- staged candidate validation
- protected app/config backup + rollback attempt
- archive-install migration without RF-stack rebuild
- installer existing-install detection

### Alpha6 migration executable-bit hotfix

The first migration implementation chmod'd tracked files inside `/opt/ywd-hotspot/repo`; Git correctly reported mode changes as a dirty tree and the safety guard stopped the update.

The fix:

- preserves tracked executable modes
- avoids chmod mutation inside the managed checkout
- ignores mode-only drift while still refusing content changes
- invokes staged scripts through Bash

Recovery notes remain documented in `docs/UPGRADING.md`.

## 0.1.0-alpha5 — Calibration Prep + UI Polish

**Status:** superseded before promotion.

Added:

- directional RX/TX animation
- collapsible Last Heard
- approximate location lookup/cache
- unsaved-settings warning
- calibration baseline save/restore
- calibration sessions/results
- mobile layout polish

## 0.1.0-alpha4.1 — Stability + Web Config Hotfix

Fixed the Alpha4 updater/admin `init-applied` stdin bug while retaining:

- transactional browser configuration
- config history/rollback
- advanced RF settings
- RF/service controls
- health/diagnostics
- persistent journaling
- service recovery hardening
- sanitized diagnostic export
- Wi-Fi/power/SD/kernel health visibility

## 0.1.0-alpha4 — Stability + Web Config

Introduced transactional WebUI configuration and expanded diagnostics/stability controls.

Known issue: updater called `ywd-hotspot-admin init-applied` in a way that waited for EOF on stdin. Fixed by Alpha4.1 and must not be reintroduced.

## 0.1.0-alpha3 — BM Controls + Live DMR

Added:

- BrandMeister API integration
- Drop QSO / Drop All Dynamic
- static/dynamic TG display and management
- authenticated control mode
- live RF receive/transmit activity
- source callsign/DMR ID and destination info
- BER/RSSI / packet-loss context
- richer Last Heard
- OLED live activity
- RadioID callsign lookup/update

## 0.1.0-alpha2 — Initial custom stack

Initial YWD-Hotspot stack with MMDVM-Host, DMRGateway, dashboard, OLED, CLI, and BrandMeister connectivity.