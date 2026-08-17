# YWD-Hotspot Plugin Framework

Plugin development currently lives on the `dev-plugins` branch. The stable `dev` appliance remains the rollback baseline. The first physically proven framework checkpoint is `dev-plugins-alpha13.1-known-good`.

## Core plugin rules

- Plugin support is **globally disabled by default** when no plugin state file exists.
- The **Plugin Manager is trusted YWD-Hotspot core**, not a plugin.
- Disabling the plugin subsystem leaves the normal DMR appliance untouched.
- **Master OFF is authoritative:** all active service plugins are stopped/unloaded before the disabled state is committed, then every per-plugin activation flag is cleared.
- Re-enabling the plugin subsystem does **not** silently reactivate plugins that were active before master disable; each plugin must be explicitly enabled again.
- Plugin configuration is preserved when a plugin or the entire subsystem is disabled.
- Plugin packages do not modify the canonical `/etc/ywd-hotspot/config.json`.
- Plugin subsystem state is stored in `/etc/ywd-hotspot/plugin-state.json`.
- Per-plugin configuration is stored under `/etc/ywd-hotspot/plugins/`.
- Existing protected `/etc/ywd-hotspot` update backups preserve plugin state/config automatically.
- Plugin state/config/lifecycle changes use narrow root-helper actions; there is no arbitrary plugin sudo command.
- RF ownership remains forbidden in the current service-plugin phase.

## Declarative Plugin API v1

First-party data-only packages live below:

```text
lib/plugin_packages/
  <plugin-id>/
    plugin.json
    config.schema.json
```

Declarative packages do **not** import/execute plugin Python and do **not** inject plugin JavaScript/CSS into the browser. The trusted core interprets validated manifests and configuration schemas.

The bundled `system-info` reference plugin proves discovery, validation, configuration persistence, master/per-plugin state, status rendering, and controlled tests without touching RF, systemd, networking, BrandMeister, OLED, or privileged commands.

## Sandboxed Service Plugin API v1

After the declarative framework was physically proven on the Pi Zero, the next phase adds tightly constrained service-backed plugins.

Service packages live separately:

```text
lib/service_plugin_packages/
  <plugin-id>/
    plugin.json
    config.schema.json
    service.py
```

A service plugin **cannot ship its own systemd unit**. Every service plugin runs through the same trusted core template:

```text
systemd/ywd-plugin@.service
```

For this phase the template deliberately applies a restrictive sandbox:

- runs as the unprivileged `ywd-hotspot` account
- `NoNewPrivileges=yes`
- no Linux capabilities
- private device namespace
- protected/read-only system paths
- protected home directories
- protected kernel tunables/modules/control groups
- namespace/SUID restrictions
- no network address families except local `AF_UNIX`
- no RF/device ownership

The service manifest may only request the explicitly allowed lifecycle/journal capabilities. Unknown fields, unsupported capabilities, RF ownership, bad IDs, invalid schemas, or unsafe entrypoint references fail closed.

### Lifecycle semantics

**ENABLE** on a service plugin performs `systemctl enable --now` through the validated root helper. **DISABLE** performs `disable --now`, clears its activation state, and preserves configuration.

While enabled, WebUI runtime controls provide:

- START
- STOP RUNTIME
- RESTART
- LOGS
- TEST

`STOP RUNTIME` intentionally does **not** disable boot activation. The card displays both runtime state and systemd boot state so the distinction is visible.

Master **DISABLE ALL PLUGINS** stops/disables all service plugins first. If a service cannot be safely stopped, the master-disable operation fails rather than falsely reporting that the subsystem is off.

## Reference service plugin: Service Heartbeat Test

`service-heartbeat` is intentionally harmless. It periodically writes a configurable heartbeat line to its own systemd journal and otherwise sleeps.

It exists to prove:

1. service manifest/schema validation
2. shared sandbox-template execution
3. enable/disable + boot activation
4. runtime start/stop/restart
5. health reporting
6. journal viewing from the WebUI
7. configuration persistence/restart behavior
8. master kill-switch behavior
9. reboot behavior
10. Pi Zero responsiveness/overhead

It has no RF, networking, OLED, BrandMeister, device, or privileged-command access.

## WebUI

The trusted **PLUGINS** section provides:

- plugin subsystem status + master kill switch
- installed/enabled/active counts
- declarative/service model identification
- per-plugin validation/health/capability information
- runtime + boot state for service plugins
- enable/disable
- schema-rendered configuration
- START / STOP RUNTIME / RESTART
- plugin journal display
- controlled health/test actions
- YWD-styled confirmation dialogs and busy feedback

When the master switch is disabled, installed package metadata and configuration may still be displayed, but plugin lifecycle/test controls are inert and all activation state is OFF.

## Planned later work

Service-backed plugins must become boringly reliable before RF-mode plugins are permitted. Later safety requirements include:

- deterministic service handling across application updates/rollback
- plugin install/uninstall/data-removal workflow
- explicit dependency/hardware checks
- richer service resource limits/health policy
- one RF owner at a time
- core-owned RF arbitration
- Lab Mode with automatic return to DMR
- emergency **Disable All Plugins + Restore Core DMR** behavior
- optional experimental MMDVM live-telemetry plugin
- alternate MMDVM modes such as YSF/P25/NXDN/M17 only after hardware/software capability checks pass

No later plugin API may weaken the rule that removing/disabling all plugins leaves a normal working YWD-Hotspot DMR appliance.
