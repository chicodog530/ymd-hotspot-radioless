# Changelog

YWD-Hotspot is currently in alpha development. This changelog summarizes project checkpoints rather than promising semantic-versioning stability.

## 0.1.0-alpha6 — GitHub Integration + About

**Status: current development/test build. Do not treat as known-good until separately confirmed.**

### Migration hotfix — 2026-08-15

The first Alpha6 GitHub-migration commit changed executable bits inside `/opt/ywd-hotspot/repo` after cloning it. Git correctly reported those mode changes as local modifications, so the safety check refused to continue.

The hotfix:

- stores executable mode on the repository shell/CLI entry points
- no longer `chmod`s tracked files inside the managed checkout
- configures the managed checkout to ignore executable-bit-only drift while still refusing content changes
- invokes staged updater scripts through `bash` so update safety does not depend on archive/file-mode behavior
- preserves the existing canonical-origin, dirty-content, staging, rollback and RF-state safety checks

A system that hit the original mode-only refusal can recover without rebuilding MMDVM-Host or DMRGateway by setting `core.fileMode=false` on `/opt/ywd-hotspot/repo` and rerunning `MIGRATE-TO-GITHUB.sh`. See `docs/UPGRADING.md`.

Highlights:

- WebUI About page with larger optimized YWD-Hotspot logo
- links to the canonical GitHub repository and `https://kj6ywd.net`
- KJ6YWD author credit
- branch/ref, commit, commit date, source type/state and version provenance
- compact branch/commit display in the main dashboard header
- `/etc/ywd-hotspot/build-info.json` provenance metadata
- root-owned managed checkout at `/opt/ywd-hotspot/repo` separate from `/opt/ywd-hotspot/app`
- `ywd-hotspotctl source`
- `ywd-hotspotctl update --check`
- `ywd-hotspotctl update --dry-run`
- `ywd-hotspotctl update` with branch/tag support
- staged GitHub candidate validation before changing the live application
- dirty-checkout and canonical-origin safety checks
- protected application + configuration pre-update backup and rollback attempt
- `MIGRATE-TO-GITHUB.sh` for archive-installed systems without radio-stack recompilation
- `INSTALL.sh` existing-install detection with a GitHub adoption option
- repository/install/update documentation updated for `merberg-ai/ywd-hotspot`

Normal Alpha6 application updates do not rebuild the pinned MMDVM-Host or DMRGateway binaries and preserve the existing RF active/enabled policy.

## 0.1.0-alpha5 — Calibration Prep + UI Polish

**Status: superseded by Alpha6 before promotion to a confirmed known-good checkpoint.**

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
