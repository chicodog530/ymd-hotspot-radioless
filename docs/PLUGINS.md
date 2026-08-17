# YWD-Hotspot Plugin Framework

Plugin development currently lives on the `dev-plugins` branch. The stable `dev` appliance remains the rollback baseline.

## Plugin API v1

Plugin API v1 is intentionally small and fail-closed. It exists to prove plugin discovery, configuration, lifecycle state, WebUI management, validation, backup/restore behavior, and the master kill switch before any plugin is allowed to own a service or touch RF.

### Core rules

- Plugin support is **globally disabled by default** when no plugin state file exists.
- The **Plugin Manager is trusted YWD-Hotspot core**, not a plugin.
- Disabling the plugin subsystem leaves the normal DMR appliance untouched.
- Plugin packages do not modify the canonical `/etc/ywd-hotspot/config.json`.
- Plugin subsystem state is stored in `/etc/ywd-hotspot/plugin-state.json`.
- Per-plugin configuration is stored under `/etc/ywd-hotspot/plugins/`.
- Existing protected `/etc/ywd-hotspot` update backups therefore preserve plugin state/config automatically.
- Plugin API v1 does **not import or execute plugin Python**.
- Plugin API v1 does **not load plugin JavaScript/CSS** into the browser.
- Plugin API v1 does **not permit plugin services**.
- Plugin API v1 does **not permit RF-mode ownership**.
- Plugin state/config changes use narrow root-helper actions; there is no arbitrary plugin sudo command.

## Bundled plugin packages

First-party v1 packages live below:

```text
lib/plugin_packages/
  <plugin-id>/
    plugin.json
    config.schema.json
```

The runtime copies the whole `lib/` tree, so bundled packages follow the same normal GitHub update/rollback path as the Plugin Manager core.

A v1 manifest describes metadata and capabilities only. Unknown keys, unsupported capabilities, invalid IDs, service declarations, unsupported providers, or invalid schemas cause the package to be marked invalid/rejected.

## WebUI

The trusted WebUI adds a **PLUGINS** section with:

- plugin subsystem status
- master enable/disable control
- installed/enabled/active counts
- per-plugin manifest/health information
- capability display
- per-plugin enable/disable
- schema-rendered configuration
- a controlled test action

When the master switch is disabled, installed package metadata may still be displayed by the core Plugin Manager, but plugins are not active.

## Reference plugin: System Info Test

`system-info` is intentionally boring. It is a declarative package using the built-in `system-summary` provider and capability `read:system-summary`.

It exists to verify:

1. manifest discovery and strict validation
2. default global-disabled behavior
3. master enable/disable
4. per-plugin enable/disable
5. per-plugin configuration persistence
6. safe WebUI rendering
7. plugin test/health flow
8. update/rollback persistence

The reference package cannot control RF, systemd, networking, BrandMeister, the OLED, or privileged commands.

## Planned later API work

Only after API v1 is physically proven should later revisions add service-backed or RF-mode plugins. Planned safety requirements include:

- one RF owner at a time
- core-owned RF arbitration
- explicit capability grants
- systemd sandboxing
- dependency/hardware checks
- Lab Mode with automatic return to DMR
- service health/log controls
- deterministic uninstall/data removal
- emergency **Disable All Plugins + Restore Core DMR** behavior
- optional experimental MMDVM live-telemetry plugin
- experimental alternate MMDVM mode plugins such as YSF/P25/NXDN/M17 only when hardware/software capability checks pass

No later plugin API may weaken the rule that removing/disabling all plugins leaves a normal working YWD-Hotspot DMR appliance.
