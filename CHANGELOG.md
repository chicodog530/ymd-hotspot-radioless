# 🗒️ Changelog

[Project README](README.md) · [Docs](docs/README.md) · [Development notes](docs/GITHUB-SETUP.md)

YWD-Hotspot is still alpha software. These are project checkpoints, not a promise of strict semantic-versioning stability.

---

## 0.1.0-alpha12-dev — Live DMR Instrument Panel + Unified OLED

**Status:** active `dev` test build. No MMDVM-Host or DMRGateway pin changes are included.

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

- dashboard now explicitly serves instrumentation JS/CSS assets
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

**Status:** user-tested successfully before Alpha9 work; checkpoint retained as `dev-alpha8-known-good`.

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
