# Contributing to YWD-Hotspot

Thanks for helping with YWD-Hotspot. The priority order is intentionally unglamorous: **RF safety and stability beat feature count**.

## Current phase

`0.1.0-alpha6` is the current development/test build. It adds GitHub provenance/update management and About/branding integration on top of the Alpha5 calibration-prep UI.

The next major RF engineering phase remains controlled DMR calibration followed by a stability soak.

Avoid bundling unrelated protocol/network expansion into bug-fix or calibration changes. Deferred examples include TGIF/multi-network routing, YSF, P25, NXDN, D-Star, FM, public-Internet admin, dashboard Wi-Fi management and large frontend framework migrations.

## Design constraints

The performance target is the original Raspberry Pi Zero W. Prefer:

- Python standard library where practical
- small bounded files/caches
- plain HTML/CSS/JS
- event/cached state over expensive repeated polling
- CSS animation over canvas/WebGL/framework animation
- optional UI services that cannot take down the DMR path

Avoid Node.js runtime dependencies, SQL/Redis, Docker or a heavy web framework without a compelling architectural reason.

## RF safety

Do not introduce install/update/config behavior that starts RF merely because source/service definitions changed.

Installer/updater/runtime-control behavior must preserve explicit operator intent. Starting RF should remain obvious and deliberate.

## GitHub update architecture

Keep these concepts separate:

```text
/opt/ywd-hotspot/repo    managed source
/opt/ywd-hotspot/app     live deployed application
```

Do not change the updater to run the appliance directly from a mutable Git working tree.

Keep canonical-origin verification, dirty-tree refusal, candidate staging/validation and protected rollback behavior unless a stronger replacement is demonstrated.

## Configuration rules

`/etc/ywd-hotspot/config.json` is canonical. Generated MMDVM-Host/DMRGateway INI files are outputs, not independent sources of truth.

Configuration changes should retain:

- normalization/validation
- transactional apply
- rollback history
- secret redaction
- appropriate service-impact classification

## Upstream pins

Do not casually update `pins.env` in the same change as unrelated UI/application work. An upstream radio-stack pin change alters the calibration/stability baseline and requires its own testing.

## Script permissions and line endings

```bash
chmod +x INSTALL.sh UPDATE.sh UNINSTALL.sh GITHUB-UPDATE.sh MIGRATE-TO-GITHUB.sh
chmod +x bin/ywd-hotspotctl lab/mmdvm-diag.sh lib/*.py
```

The repository `.gitattributes` forces LF text endings for scripts/source.

## Basic checks

Before a PR, run at least:

```bash
bash -n INSTALL.sh UPDATE.sh UNINSTALL.sh GITHUB-UPDATE.sh MIGRATE-TO-GITHUB.sh
bash -n lab/mmdvm-diag.sh bin/ywd-hotspotctl
python3 -m py_compile lib/*.py
```

If available:

```bash
node --check web/app.js
```

Remove generated `__pycache__` before committing; `.gitignore` excludes it.

Changes that touch systemd/sudoers/config generation/install/update/RF behavior should also be exercised on an actual Pi test installation before being called ready.

## Bug reports

A useful report includes version, branch/commit (`ywd-hotspotctl source`), Raspberry Pi model/OS, MMDVM firmware, what changed immediately before the issue, expected/actual behavior, and sanitized diagnostics where relevant.

Never attach a raw protected config/update backup or reusable credential.
