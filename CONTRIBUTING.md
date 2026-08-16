# Contributing to YWD-Hotspot

Thanks for helping with YWD-Hotspot. The project has a slightly unusual priority order: **RF safety and stability beat feature count**.

## Current phase

`0.1.0-alpha5` is under test. The next engineering phase is controlled DMR calibration followed by a stability soak.

Until that work is complete, avoid bundling unrelated protocol/network expansions into bug-fix PRs.

Deferred examples include TGIF/multi-network routing, YSF, P25, NXDN, D-Star, FM, public-Internet admin, dashboard Wi-Fi management and large frontend framework migrations.

## Design constraints

The performance target is the original Raspberry Pi Zero W. Contributions should prefer:

- Python standard library where practical
- small bounded files/caches
- plain HTML/CSS/JS
- event/cached state over expensive repeated polling
- CSS animation over canvas/WebGL/framework animation
- optional UI services that cannot take down the DMR path

Avoid adding Node.js, a database server, Redis, Docker or a heavy web framework without a compelling architectural reason.

## RF safety

Do not introduce update/config behavior that starts RF merely because a service definition changed.

Installer/updater/runtime-control behavior must preserve explicit operator intent. Starting RF should remain an obvious, deliberate action.

## Configuration rules

`/etc/ywd-hotspot/config.json` is canonical. Generated MMDVM-Host/DMRGateway INI files are outputs, not independent sources of truth.

Configuration changes should retain:

- normalization/validation
- transactional apply
- rollback history
- secret redaction
- appropriate service-impact classification

## Upstream pins

Do not casually update `pins.env` in the same change as unrelated UI/application work. An upstream radio-stack pin change alters the calibration/stability baseline and needs its own testing.

## Script permissions and line endings

Before committing shell/Python entry points:

```bash
chmod +x INSTALL.sh UPDATE.sh UNINSTALL.sh
chmod +x bin/ywd-hotspotctl lab/mmdvm-diag.sh
chmod +x lib/*.py
```

The repository `.gitattributes` forces LF text endings for scripts/source.

## Basic checks

Before a PR, run at least:

```bash
bash -n INSTALL.sh UPDATE.sh UNINSTALL.sh lab/mmdvm-diag.sh bin/ywd-hotspotctl
python3 -m py_compile lib/*.py
```

Remove any generated `__pycache__` before committing; `.gitignore` also excludes it.

Changes that touch systemd/sudoers/config generation should additionally be tested on an actual Pi test installation before being labeled ready.

## Bug reports

A useful bug report includes version, Raspberry Pi model/OS, MMDVM firmware, what changed immediately before the issue, expected/actual behavior, and sanitized logs/diagnostics where relevant.

Never attach a raw protected config backup or reusable credential.
