# Security Policy

YWD-Hotspot controls radio/network services and stores reusable credentials. Treat a deployed hotspot as an appliance, not as a disposable static website.

## Supported development state

The project is currently alpha software. `0.1.0-alpha5` is under test; `0.1.0-alpha4.1` is the last confirmed known-good checkpoint.

Security fixes may therefore land only on the active development line rather than being backported to every alpha build.

## Network exposure

The built-in dashboard uses plain HTTP and is intended for a trusted LAN.

**Do not directly expose the dashboard TCP port to the public Internet.**

If remote administration is required, put it behind an appropriate authenticated/encrypted access layer rather than forwarding the YWD dashboard port itself.

## Secrets

YWD-Hotspot keeps these credentials separate:

- BrandMeister Hotspot Security password
- BrandMeister API v2 key
- local web-control password

The API key is stored on the Pi and used server-side. The browser does not receive it back.

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

A `ywd-hotspotctl backup` archive intentionally contains configuration credentials and is mode `0600`.

## Diagnostics

Use the built-in sanitized diagnostic exporter for support rather than manually archiving `/etc/ywd-hotspot`.

```bash
sudo ywd-hotspotctl diagnostics
```

The exporter is designed to exclude/redact reusable passwords and API keys. Still review any bundle before publishing it.

## Reporting a security issue

Do not open a public issue containing exploit details plus working credentials/private deployment data. If the GitHub repository has a private security-reporting mechanism enabled, use that. Otherwise open a minimal public issue asking the maintainer for a private contact path without including secrets or sensitive reproduction data.

## Privilege model

The web service runs as the restricted `ywd-hotspot` account. Root-required operations are constrained through `/usr/local/libexec/ywd-hotspot-admin` and `/etc/sudoers.d/ywd-hotspot`.

Changes that broaden sudo permissions, execute user-supplied shell text, expose secrets to browser JavaScript, or let the browser directly edit generated INI files should receive extra scrutiny.
