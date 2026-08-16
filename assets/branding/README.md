# 🎨 Branding Assets

[← Project README](../../README.md)

This directory holds the YWD-Hotspot source artwork and lightweight runtime derivative.

| Asset | Purpose |
|---|---|
| `ywd-hotspot-logo-master.png` | Original 1254×1254 RGBA source artwork |
| `ywd-hotspot-badge-256.webp` | 256 px optimized WebP used by the README and WebUI |

The multi-megabyte master PNG stays in the source repository and is **not** copied into the deployed Pi runtime. The WebUI serves only the small WebP badge to keep storage, backups, and page loads lightweight on the original Pi Zero W.

When changing branding, preserve the master artwork as the source asset and regenerate an appropriately sized WebP derivative for runtime use rather than serving the full PNG.
