# 🧱 YWD-Hotspot Architecture

[← Docs index](README.md) · [Project README](../README.md) · [Security](../SECURITY.md) · [Development notes](GITHUB-SETUP.md)

---

YWD-Hotspot keeps the actual DMR transport path deliberately small and separates presentation/admin features from RF operation.

## 📡 RF path

```text
DMR radio
   │
   ▼
MMDVM HAT
   │
   ▼
MMDVM-Host
   │
   ▼
DMRGateway
   │
   ▼
BrandMeister
```

The core RF path does not depend on the dashboard, OLED, or activity presentation continuing to run.

## 🧩 Side services

| Service | Role |
|---|---|
| `ywd-activity.service` | Parses MMDVM-Host activity into bounded cached state / Last Heard data |
| `ywd-dashboard.service` | Python stdlib HTTP dashboard/API; reads cached state and routes validated writes through the admin helper |
| `ywd-oled.service` | Optional I2C status/activity display; failure must not interrupt DMR |
| `ywd-dmrid-update.timer` | Periodically refreshes lightweight RadioID data when due |

## 🔐 Privilege boundary

The dashboard runs as the restricted `ywd-hotspot` user.

Privileged browser operations are funneled through:

```text
/usr/local/libexec/ywd-hotspot-admin
```

with the restricted sudo policy:

```text
/etc/sudoers.d/ywd-hotspot
```

The browser must never directly execute arbitrary shell text or directly edit generated MMDVM-Host/DMRGateway INI files.

## ⚙️ Canonical configuration

Source of truth:

```text
/etc/ywd-hotspot/config.json
```

Generated outputs:

```text
/etc/ywd-hotspot/MMDVM-Host.ini
/etc/ywd-hotspot/DMRGateway.ini
```

Configuration flow:

```text
browser / CLI input
        │
        ▼
validate + normalize
        │
        ▼
transactional canonical JSON update
        │
        ▼
regenerate temporary INIs
        │
        ▼
atomic apply / scoped service action
```

Normal configuration history is retained separately for rollback.

## 🔑 Credential separation

YWD-Hotspot treats these as different secrets:

1. BrandMeister Hotspot Security password — used by DMRGateway
2. BrandMeister API v2 key — server-side BM control actions
3. local WebUI control password — unlocks LAN write/admin controls

Reusable secret material must not appear in browser-readable config, support summaries, or public diagnostic bundles.

## 📁 Runtime/state layout

```text
/etc/ywd-hotspot/
  config.json
  MMDVM-Host.ini
  DMRGateway.ini
  bm-api.key
  web-auth.json
  build-info.json
  update-channel

/var/lib/ywd-hotspot/
  DMRIds.dat
  lastheard.json
  calibration.json
  calibration-baseline.json
  geocode-cache.json
  talkgroup-directory.json
  config-history.json
  audit.json
  private/

/var/backups/ywd-hotspot/
```

Private runtime/config backups can contain credentials and must not be published.

## 🌿 GitHub source vs live runtime

```text
/opt/ywd-hotspot/repo    root-owned managed Git checkout
/opt/ywd-hotspot/app     deployed application copy; no .git
```

Update flow:

```text
GitHub fetch
   │
   ▼
resolve target commit
   │
   ▼
stage + validate candidate
   │
   ▼
protected app/config backup
   │
   ▼
transactional UPDATE.sh
   │
   ▼
restore prior RF/service policy
   │
   ▼
advance managed checkout after success
```

Network failure, dirty source, or candidate-validation failure occurs before the live application is touched.

## 🌐 WebUI layers

The browser side intentionally stays small:

```text
style.css          base dashboard theme
app-core.js        established dashboard behavior
talkgroups.js      Talkgroup Manager layer
ui-polish.css      CSP-safe micro-polish / animation / busy states
ui-polish.js       themed confirms + lightweight UX wrappers
app.js             tiny loader
```

The UI uses same-origin external assets so the dashboard can retain a restrictive Content-Security-Policy without `unsafe-inline` styling.

Visual effects are browser-side. They do not add a daemon, database, framework, or high-frequency backend polling loop.

## 🥧 Pi Zero performance budget

Prefer:

- Python standard library
- small long-running collectors
- cached/event state over repeated expensive shelling
- plain HTML/CSS/JS
- CSS animation
- bounded local files

Avoid turning a Pi Zero into infrastructure cosplay:

- no Node.js runtime
- no React/Vue requirement
- no SQL server
- no Redis
- no Docker dependency
- no heavyweight graphing framework without a real need

## 📡 RF safety invariant

Install, update, config-apply, and runtime-control paths must preserve explicit operator intent.

A UI change, Git pull, dashboard restart, or software update is **never** permission to unexpectedly start a transmitter.
