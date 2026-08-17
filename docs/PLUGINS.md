# YWD-Hotspot Plugin Framework

Plugin development currently lives on the `dev-plugins` branch. The stable `dev` appliance remains the non-plugin rollback baseline.

Current plugin-development milestones:

- `dev-plugins-alpha13.1-known-good` — declarative Plugin Framework v1 + fail-closed master switch
- `dev-plugins-alpha14-known-good` — sandboxed service-plugin lifecycle, logs, reboot behavior, and master kill-switch
- `dev-plugins-alpha15.1-known-good` — physically proven reboot + application-update survival at `77da3eeb489025f73d61c1141feb808f6f74c2c1`
- `0.1.0-alpha16-dev` — package install/uninstall/data-removal + dependency/hardware-check test phase

Alpha16 does **not** grant plugins RF ownership and does not add third-party Internet package downloads.

## Core plugin rules

- Plugin support is **globally disabled by default** when no plugin activation-state file exists.
- The **Plugin Manager is trusted YWD-Hotspot core**, not a plugin.
- Disabling the plugin subsystem leaves normal DMR operation untouched.
- **Master OFF is authoritative:** active service plugins are stopped/unloaded before disabled state is committed, then every per-plugin activation flag is cleared.
- Re-enabling the plugin subsystem does **not** silently reactivate plugins.
- Installing a plugin does **not** enable or start it.
- Uninstalling a plugin stops/removes service boot activation and clears activation state, but preserves config/data by default.
- Removing plugin data is a separate destructive action.
- Plugin configuration never modifies canonical `/etc/ywd-hotspot/config.json`.
- No plugin gets arbitrary sudo.
- RF ownership remains forbidden in the current API.

## State separation

Alpha16 deliberately separates four concepts:

```text
AVAILABLE  -> package source exists in the trusted application catalog
INSTALLED  -> package is registered as eligible for use
ENABLED    -> operator explicitly enabled the installed plugin
ACTIVE     -> plugin is effectively running/active now
```

The files are separate as well:

```text
/etc/ywd-hotspot/plugin-state.json
    master enable + per-plugin activation state

/etc/ywd-hotspot/plugin-packages.json
    package installation/registration state

/etc/ywd-hotspot/plugins/<id>.json
    per-plugin configuration

/var/lib/ywd-hotspot/plugins/<id>
    reserved plugin-owned runtime data path when a future approved plugin needs it
```

This separation keeps the reboot/update behavior proven in Alpha15.1 independent from package lifecycle.

### Alpha15 -> Alpha16 migration behavior

Alpha15.1 had no package-state file because both bundled reference packages were implicitly installed.

When `/etc/ywd-hotspot/plugin-packages.json` is **missing**, Alpha16 treats only these pre-Alpha16 reference IDs as installed:

```text
system-info
service-heartbeat
```

This preserves the currently proven hotspot during the first Alpha16 update.

Future packages introduced by later updates do **not** inherit that compatibility rule; they appear as `AVAILABLE` until explicitly installed.

If a package-state file exists but is invalid/corrupt, package registration fails closed: packages are treated as uninstalled instead of falling back to legacy defaults.

## Declarative Plugin API v1

First-party data-only packages live below:

```text
lib/plugin_packages/
  <plugin-id>/
    plugin.json
    config.schema.json
```

Declarative packages do **not** import/execute plugin Python and do **not** inject plugin JavaScript/CSS into the browser. Trusted core interprets validated manifests and schemas.

The bundled `system-info` reference plugin proves discovery, configuration, package lifecycle, activation state, status rendering, and controlled tests without touching RF, systemd, networking, BrandMeister, OLED, or privileged commands.

## Sandboxed Service Plugin API v1

Service packages live separately:

```text
lib/service_plugin_packages/
  <plugin-id>/
    plugin.json
    config.schema.json
    service.py
```

A service plugin **cannot ship its own systemd unit**. Every service plugin runs through:

```text
systemd/ywd-plugin@.service
```

The shared template remains restrictive:

- unprivileged `ywd-hotspot` user/group
- `NoNewPrivileges=yes`
- no Linux capabilities
- private device namespace
- protected/read-only system paths
- protected home directories
- protected kernel tunables/modules/control groups
- namespace/SUID restrictions
- only local `AF_UNIX` address family
- no RF/device ownership

### Alpha16 package gate

The shared systemd template now has a trusted `ExecCondition` that calls:

```text
plugin_package_manager.py require-installed <plugin-id>
```

A repository-bundled service whose package registration is `UNINSTALLED` therefore cannot start through the normal YWD plugin template simply because its source file still ships with the application.

This lets first-party package source remain available for reinstall while runtime eligibility stays explicit.

## Package install

Alpha16 first supports only first-party packages already shipped in the repository.

`INSTALL` performs trusted core checks in this order:

1. validate plugin ID and manifest
2. validate plugin API/trust/kind/capabilities
3. evaluate declared dependency requirements
4. evaluate declared hardware requirements
5. make any stale service instance inactive/boot-disabled
6. register the package as installed
7. explicitly set its activation state to disabled

Install never:

- starts a plugin
- enables a plugin at boot
- downloads code
- runs `curl | bash`
- runs arbitrary package-manager commands
- grants new sudo/device/RF access

## Package uninstall

`UNINSTALL`:

1. resolves the trusted available package
2. stops and boot-disables its service if applicable
3. verifies no active/enabled service instance remains
4. clears plugin activation state
5. removes package registration
6. preserves configuration/data

For bundled first-party packages, uninstall removes **registration/runtime eligibility**, not the source files shipped inside `/opt/ywd-hotspot/app`. That source remains the trusted available package used by a later reinstall.

This is intentional: application updates own application files; Plugin Manager owns package eligibility.

## Remove data

`REMOVE DATA` is separate from uninstall and uses the custom YWD destructive confirmation dialog.

Server-side checks require the plugin to be disabled and any service to be stopped/boot-disabled.

Only exact core-owned paths derived from a validated plugin ID may be removed:

```text
/etc/ywd-hotspot/plugins/<id>.json
/var/lib/ywd-hotspot/plugins/<id>
```

No plugin-controlled glob or arbitrary removal path is accepted.

## Dependency checks

Manifest dependency requirements are declarative tokens interpreted by trusted core. Plugins do not execute their own dependency probes.

Alpha16 recognizes:

```text
python3
systemd
journalctl
mmdvm-host
```

Current reference packages declare only what they actually need:

```text
system-info:
  python3

service-heartbeat:
  python3
  systemd
  journalctl
```

The Plugin Manager exposes **CHECK DEPENDENCIES** and shows pass/missing results.

Installation and enable/start operations fail closed when a declared dependency is missing.

Alpha16 does **not** automatically install missing OS packages.

## Hardware/capability checks

Hardware requirements are also declarative tokens resolved by trusted core.

Alpha16 provides the first allow-listed probes:

```text
mmdvm-serial  -> /dev/serial0 exists
oled-i2c      -> /dev/i2c-1 exists
```

The current reference plugins require no special hardware, so their hardware check reports pass/N/A.

These probes establish the contract that later MMDVM integration plugins must use instead of simply claiming hardware support.

More specific MMDVM firmware/mode/feature checks can be added to trusted core when the first real integration plugin requires them.

## Lifecycle semantics

For an installed service plugin:

**ENABLE** performs validated `systemctl enable --now` through the narrow root helper.

**DISABLE** performs `disable --now`, clears activation state, and preserves config.

While enabled, runtime controls remain:

```text
START
STOP RUNTIME
RESTART
LOGS
TEST
```

`STOP RUNTIME` intentionally does **not** disable boot activation.

Expected card state after runtime-only stop:

```text
Status   STOPPED
Runtime  inactive
Boot     enabled
```

After reboot, systemd starts it again. This behavior was physically validated in Alpha15.1.

## Reference service plugin: Service Heartbeat Test

`service-heartbeat` remains intentionally harmless. It periodically writes a configurable line to its own journal and otherwise sleeps.

It now also serves as the package-lifecycle proof target:

1. uninstall while active must stop it
2. no boot-enabled instance may remain
3. config must survive uninstall
4. reinstall must leave it disabled
5. explicit enable may start it again
6. remove-data must be separately confirmed
7. reboot/update must not resurrect an uninstalled package

It has no RF, normal networking, OLED, BrandMeister, device, or privileged-command access.

## WebUI

The trusted **PLUGINS** section now distinguishes:

```text
AVAILABLE
INSTALLED
ENABLED
ACTIVE
```

Per package it exposes:

```text
INSTALL / UNINSTALL
CHECK DEPENDENCIES
CHECK HARDWARE
REMOVE DATA (only when saved config/data exists)
ENABLE / DISABLE
START / STOP RUNTIME / RESTART
LOGS
TEST
CONFIGURE
SAVE
SAVE + RESTART PLUGIN
```

Uninstall/data-removal and lifecycle-destructive actions use the themed YWD confirmation UI, not native browser `confirm()`.

The UI remains strict-CSP compatible; no inline style injection is required.

## Update + rollback safety

Plugin-aware application updates continue to use `lib/plugin_update_safety.py`.

The proven Alpha15.1 flow remains:

1. capture master/per-plugin activation + exact service runtime/boot state
2. quiesce plugin services
3. run the proven core updater
4. validate the target plugin catalogs
5. restore only valid prior activation/runtime state

Alpha16 package registration is stored separately under `/etc/ywd-hotspot`, so it is preserved by the existing protected config backup and is not rewritten by normal plugin runtime restoration.

The new systemd package gate adds a second fail-closed check: even if stale activation data somehow requests an uninstalled service after update, the unit condition refuses to start it.

Application update locking still blocks plugin state/config/package/lifecycle mutations while `/run/ywd-hotspot-update.lock` is held.

## Leaving `dev-plugins`

Switching to a plugin-free target still quiesces plugin services first and clears activation state. Stable `dev` does not need plugin-specific code.

Package/config files under `/etc/ywd-hotspot` may remain as inert data. Returning later to `dev-plugins` never auto-enables plugins; activation must again be explicit.

## Fail-closed rules

1. Missing activation state -> plugin subsystem disabled.
2. Missing package state -> only the two pre-Alpha16 reference IDs use compatibility-installed defaults.
3. Invalid package state -> packages treated as uninstalled.
4. Invalid manifest -> plugin inactive/error.
5. Unknown manifest fields/requirements/capabilities -> reject.
6. Unsupported dependency/hardware token -> reject.
7. Install -> never auto-enable/start.
8. Uninstall -> service must stop/disable before registration is removed.
9. Remove data -> plugin must be disabled/stopped.
10. Uninstalled service -> shared systemd template refuses startup through package gate.
11. Update lock held -> reject package/state/config/lifecycle writes.
12. RF ownership remains forbidden.

## Alpha16 physical test checklist

After updating a real Pi Zero from the Alpha15.1 known-good checkpoint:

```text
[ ] normal DMR / BrandMeister still works
[ ] OLED owner unchanged
[ ] existing system-info still shows INSTALLED
[ ] existing service-heartbeat still shows INSTALLED
[ ] heartbeat runtime/boot state survives the Alpha15.1 -> Alpha16 update
[ ] CHECK DEPENDENCIES passes on both reference plugins
[ ] CHECK HARDWARE reports no special hardware required on both references
[ ] uninstall service-heartbeat while ACTIVE
[ ] verify Runtime != active and Boot != enabled
[ ] verify heartbeat config remains present
[ ] reboot and verify uninstalled heartbeat does NOT start
[ ] reinstall heartbeat and verify it remains DISABLED
[ ] explicitly enable heartbeat and verify it starts
[ ] uninstall again
[ ] REMOVE DATA and verify config is gone
[ ] reinstall and confirm default config is used
[ ] run a normal WebUI application update while packages have mixed installed/uninstalled state
[ ] verify uninstalled package does not resurrect
[ ] systemctl --failed is clean
```

After this passes physically, freeze another known-good plugin checkpoint before beginning MMDVM Live Telemetry.

## Planned next plugin

The recommended first useful integration remains **MMDVM Live Telemetry**.

It should build on Alpha16 package/dependency/hardware contracts and remain optional. It must not take RF ownership. The normal lightweight journal instrumentation remains functional when telemetry is not installed.

Alternate RF modes / Lab Mode remain later work.
