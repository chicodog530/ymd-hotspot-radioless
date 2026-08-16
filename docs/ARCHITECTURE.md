# YWD-Hotspot Architecture

YWD-Hotspot keeps the actual DMR transport path deliberately small and separates presentation/admin features from RF operation.

## RF path

```text
DMR radio
   |
   v
MMDVM HAT
   |
   v
MMDVM-Host
   |
   v
DMRGateway
   |
   v
BrandMeister
```

The core RF path does not depend on the dashboard, OLED or activity presentation continuing to run.

## Side services

```text
ywd-activity.service
    Parses MMDVM-Host activity into lightweight cached state/Last Heard data.

ywd-dashboard.service
    Python standard-library HTTP dashboard/API. Reads cached state and routes
    validated writes through the privileged admin helper.

ywd-oled.service
    Optional I2C display. Failure must not interrupt DMR.

ywd-dmrid-update.timer/service
    Periodically refreshes the lightweight RadioID lookup file when due.
```

## Privilege boundary

The dashboard runs as the restricted `ywd-hotspot` service user.

Privileged operations are funneled through:

```text
/usr/local/libexec/ywd-hotspot-admin
```

and the restricted sudo policy:

```text
/etc/sudoers.d/ywd-hotspot
```

The browser must never directly edit MMDVM-Host.ini/DMRGateway.ini or directly execute arbitrary shell commands.

## Canonical configuration

Source of truth:

```text
/etc/ywd-hotspot/config.json
```

Generated files:

```text
/etc/ywd-hotspot/MMDVM-Host.ini
/etc/ywd-hotspot/DMRGateway.ini
```

The workflow is:

```text
browser/CLI input
      |
      v
validate + normalize
      |
      v
transactional canonical JSON update
      |
      v
regenerate temporary INIs
      |
      v
atomic apply / appropriate service action
```

Normal configuration history is retained separately so changes can be rolled back.

## Credential separation

YWD-Hotspot treats these as different secrets:

1. BrandMeister Hotspot Security password — used by DMRGateway
2. BrandMeister API v2 key — used server-side for BM controls
3. local dashboard web-control password — unlocks LAN write/admin controls

The API key and password material must never be emitted in browser-readable configuration, support summaries or diagnostic exports.

## Runtime/state paths

```text
/etc/ywd-hotspot/config.json
/etc/ywd-hotspot/MMDVM-Host.ini
/etc/ywd-hotspot/DMRGateway.ini
/etc/ywd-hotspot/bm-api.key
/etc/ywd-hotspot/web-auth.json
/etc/ywd-hotspot/build-info.json

/var/lib/ywd-hotspot/DMRIds.dat
/var/lib/ywd-hotspot/lastheard.json
/var/lib/ywd-hotspot/calibration.json
/var/lib/ywd-hotspot/calibration-baseline.json
/var/lib/ywd-hotspot/geocode-cache.json
/var/lib/ywd-hotspot/config-history.json
/var/lib/ywd-hotspot/audit.json
/var/lib/ywd-hotspot/private/

/var/backups/ywd-hotspot/
```

Private runtime/config backups can contain credentials and must not be published.

## GitHub source/deployment separation

Alpha6 keeps source management outside the live runtime:

```text
/opt/ywd-hotspot/repo    root-owned managed Git checkout
/opt/ywd-hotspot/app     deployed application copy (no .git)
```

The normal update path is:

```text
GitHub fetch
   |
   v
resolve target commit
   |
   v
stage + validate candidate
   |
   v
protected app/config backup
   |
   v
transactional UPDATE.sh
   |
   v
restore prior RF service policy
   |
   v
advance managed checkout after success
```

Network failure, a dirty managed checkout, or candidate-validation failure occurs before the live application is touched. The updater never recompiles pinned MMDVM-Host/DMRGateway during a normal YWD application update.

Build provenance is written to `/etc/ywd-hotspot/build-info.json` and is intentionally non-secret so it can be displayed by the dashboard/About page and CLI.

## Dashboard design constraints

The original Pi Zero W is the performance budget. Prefer:

- Python standard library
- small long-running collectors
- event/cached state instead of repeated expensive polling
- plain HTML/CSS/JS
- CSS-only animation
- bounded local files

Avoid turning the project into a tiny Kubernetes convention cosplay:

- no Node.js runtime
- no React/Vue requirement
- no SQL server
- no Redis
- no Docker dependency
- no heavyweight graphing framework unless a real need appears

## RF safety invariant

Install, update, restart and config-apply paths must preserve the operator's intended RF state. A UI update is never a valid excuse to unexpectedly start a transmitter.
