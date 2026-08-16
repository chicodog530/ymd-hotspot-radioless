---
name: 🐛 Bug report
about: Report a reproducible YWD-Hotspot problem
title: "[BUG] "
labels: bug
---

> [!IMPORTANT]
> Do **not** attach reusable credentials, `/etc/ywd-hotspot`, protected backups, or unsanitized private runtime data.

## 🧭 Version / source

Paste:

```bash
ywd-hotspotctl version
ywd-hotspotctl source
```

## 🥧 Hardware / OS

- Raspberry Pi model:
- OS/version:
- MMDVM HAT type:
- MMDVM firmware/version:
- browser/device (for WebUI bugs):

## 🐛 What happened?

Describe the failure.

## ✅ What did you expect?

Describe the expected behavior.

## 🔁 Steps to reproduce

1.
2.
3.

## 📡 RF state

- RF running when it happened? yes/no
- RF enabled at boot? yes/no/unknown
- relevant TG/frequency action, if any:

## 🩺 Logs / diagnostics

Prefer the sanitized exporter:

```bash
sudo ywd-hotspotctl diagnostics
```

Review the bundle before attaching it.

## 🔧 Recent changes

What update, configuration, hardware, browser, or network change happened immediately before the problem?

## 📱 Screenshots

For UI bugs, screenshots are welcome after checking that they do not expose secrets/private data.
