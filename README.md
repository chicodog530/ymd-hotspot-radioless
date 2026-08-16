# YWD-Hotspot 0.1.0-alpha5 — Calibration Prep + UI Polish

Alpha5 builds directly on the known-good **0.1.0-alpha4.1 “Stability + Web Config”** checkpoint. It keeps the same pinned MMDVM-Host/DMRGateway RF path and schema 3 configuration. The goal of this release is to finish the UI/calibration-prep work before controlled RF calibration testing.

```text
DMR radio <-> MMDVM HAT <-> MMDVM-Host <-> DMRGateway <-> BrandMeister
                              |
                    activity / OLED / web UI
```

The dashboard remains outside the RF-critical path.

## Alpha5 highlights

### Live DMR animation

The Status page now has a lightweight CSS-only RF visualization:

- **RX FROM RADIO**: signal rings move inward toward the hotspot
- **TX TO RADIO**: signal rings radiate outward
- idle uses a subtle low-cost breathing state
- `prefers-reduced-motion` is honored
- no canvas, WebGL, animation framework, or extra runtime dependency

### Collapsible Last Heard

- Last Heard can be collapsed from its header.
- The collapsed header still shows the newest caller/destination and age.
- The collapsed/expanded preference is stored in browser local storage.

### Approximate location lookup

Settings can look up an approximate location from a **city/state or ZIP/postal code** and populate latitude/longitude.

- lookup is user-triggered only; there is no autocomplete
- up to five matches are shown
- coordinates remain manually editable
- the normal Location field is only auto-filled when it is blank/default
- results are cached locally for 30 days (up to 40 queries)
- public lookup uses OpenStreetMap Nominatim and shows `© OpenStreetMap contributors`
- if lookup is unavailable, manual coordinates continue to work normally

The lookup text is sent to the public geocoding service when the operator presses **LOOK UP**. City/ZIP-level searches are recommended; exact street addresses are unnecessary for this hotspot.

### Unsaved Settings protection

- Settings shows a visible **UNSAVED FORM EDITS** badge.
- Leaving Settings prompts while edits are unsaved.
- Browser reload/close uses the standard unsaved-changes warning.

### Calibration baseline

The CALIBRATE page adds a dedicated known-good RF baseline:

- **SAVE CALIBRATION BASELINE** records the current radio/modem settings
- **RESTORE BASELINE** restores only the radio section and applies it
- baseline data is kept separately from ordinary config history
- a pre-restore normal config snapshot is still created before restoration

### Calibration sessions/results

- **START NEW TEST** clears only the calibration result table; it does not alter RF settings.
- Recorded RX tests include offset, BER, RSSI, duration, source and destination.
- The lowest-BER observation is highlighted.
- Duplicate recording of the exact same RF call at the same RX offset is rejected.
- TX offset remains manual because the hotspot cannot measure BER at the receiving handheld.

### Support summary

Diagnostics adds **COPY SUPPORT SUMMARY**. It creates a compact sanitized text report containing:

- build/version and uptime
- service states
- BrandMeister state/master
- frequency, color code, offsets and levels
- temperature/throttle/RAM/disk
- Wi-Fi signal/error counters
- config pending/applied state
- calibration best/baseline state

Hotspot Security password, BrandMeister API key and web-control password are never included.

### Status/mobile polish

- version + hostname + uptime are visible at the top and bottom of the UI
- RF/BM/Wi-Fi/temperature strip has more useful hover/detail text
- calibration, location results and control layouts received another phone-width pass

## Security model

Status remains readable without login. All writes—including location lookup, calibration baseline changes and runtime controls—require the local web-control password.

The dashboard still runs as `ywd-hotspot`. Root operations are limited to the validated `/usr/local/libexec/ywd-hotspot-admin` actions listed in `/etc/sudoers.d/ywd-hotspot`.

The dashboard is still plain HTTP. Keep it on a trusted LAN; do not expose its port directly to the public Internet.

## Upgrade from Alpha4.1

Alpha5's updater **does not compile MMDVM-Host or DMRGateway** and preserves the existing RF running/enabled state.

```bash
cd ~/tmp
tar -xzf ywd-hotspot-0.1.0-alpha5.tar.gz
cd ywd-hotspot-0.1.0-alpha5
sudo ./UPDATE.sh
```

Then hard-refresh the dashboard.

No new credentials are required. The existing Hotspot Security password, BrandMeister API key and web-control password are preserved.

## Pinned upstream radio components

Unchanged from the known-good checkpoint:

- MMDVM-Host: `dea6e9b2c35857fe6f904c5092bebadb86cbf079`
- DMRGateway: `2a3306de313cf4c094c2031c9ced5a6858bbbfcc`

## Key files

```text
/etc/ywd-hotspot/config.json                         canonical schema-3 config
/etc/ywd-hotspot/MMDVM-Host.ini                      generated radio config
/etc/ywd-hotspot/DMRGateway.ini                       generated gateway config
/etc/ywd-hotspot/bm-api.key                           BrandMeister API key
/etc/ywd-hotspot/web-auth.json                        web-control password hash

/var/lib/ywd-hotspot/DMRIds.dat                       callsign lookup
/var/lib/ywd-hotspot/lastheard.json                    DMR history
/var/lib/ywd-hotspot/calibration.json                  current calibration session
/var/lib/ywd-hotspot/calibration-baseline.json         safe baseline metadata
/var/lib/ywd-hotspot/geocode-cache.json                approximate-location cache
/var/lib/ywd-hotspot/config-history.json               safe config-history metadata
/var/lib/ywd-hotspot/audit.json                        safe action audit
/var/lib/ywd-hotspot/private/calibration-baseline.json protected calibration baseline
/var/lib/ywd-hotspot/private/config-history/           protected rollback snapshots
```

## Main CLI commands

```bash
ywd-hotspotctl status
ywd-hotspotctl health
ywd-hotspotctl lastheard
ywd-hotspotctl logs
sudo ywd-hotspotctl apply
sudo ywd-hotspotctl diagnostics
sudo ywd-hotspotctl restart
sudo ywd-hotspotctl start
sudo ywd-hotspotctl stop
sudo ywd-hotspotctl update-ids
sudo ywd-hotspotctl lab
```

## Alpha5 test goal

After verifying the UI and location lookup, freeze feature work and begin controlled Parrot calibration:

1. save a calibration baseline
2. start a new test session
3. keep HT position/power constant
4. record BER at controlled RX offsets
5. identify the lowest repeatable BER
6. evaluate RX level only if offset calibration is insufficient
7. treat TX calibration separately using evidence from the handheld/listening path
8. restore the baseline at any time if testing gets weird
