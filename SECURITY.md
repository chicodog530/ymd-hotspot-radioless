# Security Policy

YWD-Hotspot controls radio/network services and stores reusable credentials. Treat a deployed hotspot as an appliance, not a disposable static website.

## Supported development state

The project is alpha software. `0.1.0-alpha6` is the current development/test build; `0.1.0-alpha4.1` remains the last explicitly confirmed known-good checkpoint.

Security fixes may land only on the active development line rather than being backported to every alpha build.

## Network exposure

The built-in dashboard uses plain HTTP and is intended for a trusted LAN.

**Do not directly expose the dashboard TCP port to the public Internet.**

If remote administration is required, place it behind an appropriate authenticated/encrypted access layer rather than forwarding the YWD dashboard port itself.

## Secrets

YWD-Hotspot deliberately separates:

- BrandMeister Hotspot Security password
- BrandMeister API v2 key
- local web-control password

The API key remains server-side. The browser does not receive it back.

Do not post real credentials in GitHub issues, screenshots, terminal pastes, logs or support conversations.

## Sensitive paths

Treat these as sensitive on a real installation:

```text
/etc/ywd-hotspot/config.json
/etc/ywd-hotspot/bm-api.key
/etc/ywd-hotspot/web-auth.json
/var/lib/ywd-hotspot/private/
/var/backups/ywd-hotspot/
```

`/etc/ywd-hotspot/build-info.json` is intentionally non-secret provenance and contains source/version/commit information only.

Protected backups intentionally contain configuration credentials and are restricted on disk.

## GitHub update trust boundary

GitHub-managed deployments use:

```text
/opt/ywd-hotspot/repo
```

The updater:

- accepts only the canonical `merberg-ai/ywd-hotspot` origin forms
- refuses a dirty managed checkout
- stages a requested commit separately before applying it
- validates required files and shell/Python syntax before the live runtime is touched
- advances the managed checkout only after the deployed update succeeds

The update mechanism is not an excuse to weaken RF safety. It must preserve whether RF was active/enabled before an update.

Do not use the managed root-owned checkout as a general-purpose development tree.

## Diagnostics

Use the sanitized exporter for support:

```bash
sudo ywd-hotspotctl diagnostics
```

It is designed to exclude/redact reusable passwords and API keys. Still review a bundle before publishing it.

## Reporting a security issue

Do not open a public issue containing exploit details plus working credentials/private deployment data. If GitHub private security reporting is enabled, use it. Otherwise open a minimal public issue asking the maintainer for a private contact path without including secrets or sensitive reproduction data.

## Privilege model

The web service runs as the restricted `ywd-hotspot` account. Root-required dashboard operations are constrained through:

```text
/usr/local/libexec/ywd-hotspot-admin
/etc/sudoers.d/ywd-hotspot
```

GitHub update commands are explicit root CLI operations; the Alpha6 WebUI does not expose a browser button that can pull/install arbitrary source.

Changes that broaden sudo permissions, execute user-supplied shell text, expose secrets to browser JavaScript, bypass canonical repository checks, or let the browser directly edit generated INI files require extra scrutiny.
