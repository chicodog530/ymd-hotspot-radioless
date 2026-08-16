# Changelog

YWD-Hotspot is currently in alpha development. This changelog summarizes project checkpoints rather than promising semantic-versioning stability.

## 0.1.0-alpha5 — Calibration Prep + UI Polish

**Status: currently under test. Do not treat as the known-good checkpoint yet.**

Highlights:

- lightweight directional RX/TX CSS activity animation
- collapsible Last Heard with remembered browser state
- approximate city/state or ZIP/postal coordinate lookup with local caching
- unsaved-settings warning
- calibration baseline save/restore
- calibration test sessions and BER/RSSI/offset result table
- best observed BER highlighting without automatic application
- version/uptime visibility and support-summary improvements
- phone/mobile layout polish

The updater preserves RF active/enabled state and does not rebuild the pinned radio components.

## 0.1.0-alpha4.1 — Stability + Web Config hotfix

**Status: last confirmed known-good checkpoint.**

Fixes the Alpha4 updater/admin `init-applied` stdin bug while retaining the Stability + Web Config feature set.

Confirmed working areas included:

- transactional browser configuration
- config history and rollback
- advanced RF settings
- RF/service controls
- health/diagnostics
- persistent journaling
- service recovery hardening
- sanitized diagnostic export
- Wi-Fi/power/SD/kernel health visibility
- automatic BrandMeister location disable when coordinates are `0,0`

## 0.1.0-alpha4 — Stability + Web Config

Introduced transactional web configuration and expanded diagnostics/stability controls.

Known issue: the updater called `ywd-hotspot-admin init-applied` in a way that waited for EOF on stdin. Fixed by Alpha4.1 and must not be reintroduced.

## 0.1.0-alpha3 — BM Controls + Live DMR

Added:

- BrandMeister API integration
- Drop QSO / Drop All Dynamic
- static/dynamic talkgroup display and management
- authenticated control mode
- live RF receive/transmit activity
- source ID/callsign and destination information
- BER/RSSI where available
- network packet-loss information
- richer Last Heard
- OLED live activity
- RadioID callsign lookup/update
- lower-overhead activity collection

## 0.1.0-alpha2 — Initial custom stack

Initial YWD-Hotspot stack with MMDVM-Host, DMRGateway, dashboard, OLED and CLI/BrandMeister connectivity.
