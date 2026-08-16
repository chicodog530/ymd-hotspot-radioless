# 🌿 GitHub / Development Notes

[← Docs index](README.md) · [Project README](../README.md) · [Contributing](../CONTRIBUTING.md) · [Upgrading](UPGRADING.md)

---

Canonical repository:

```text
https://github.com/merberg-ai/ywd-hotspot
```

## 🌳 Branch model

| Branch | Purpose |
|---|---|
| `main` | promoted/conservative project line |
| `dev` | active development and Pi test line |
| `dev-alpha9.2-known-good` | checkpoint of the user-tested Alpha9.2 polish build |

During alpha development, new work lands on `dev` first. A build is promoted only after it has been exercised on the actual hotspot hardware.

## 📥 Clone

Promoted line:

```bash
git clone https://github.com/merberg-ai/ywd-hotspot.git
cd ywd-hotspot
```

Development line:

```bash
git clone --branch dev https://github.com/merberg-ai/ywd-hotspot.git
cd ywd-hotspot
```

Normal Git clones preserve executable modes. If source came through a ZIP/Windows copy and modes were lost, running entry scripts through Bash is sufficient for recovery, for example:

```bash
sudo bash ./INSTALL.sh
```

`.gitattributes` keeps important text/source on LF endings.

## 🧱 Source vs deployed runtime

A hotspot does not run directly from a mutable Git tree:

```text
/opt/ywd-hotspot/repo    managed Git source checkout
/opt/ywd-hotspot/app     deployed runtime copy
```

This separation lets YWD-Hotspot fetch and validate a candidate before touching the running application.

Non-secret source provenance is recorded in:

```text
/etc/ywd-hotspot/build-info.json
```

and displayed by:

```bash
ywd-hotspotctl source
```

as well as the WebUI header/About page.

## 🔐 Never commit runtime secrets

Do not commit or attach:

- real `/etc/ywd-hotspot/config.json`
- `/etc/ywd-hotspot/bm-api.key`
- `/etc/ywd-hotspot/web-auth.json`
- `/var/lib/ywd-hotspot/private/`
- protected `/var/backups/ywd-hotspot/` archives
- arbitrary unsanitized diagnostics

Runtime configuration belongs outside the repository under `/etc/ywd-hotspot` and `/var/lib/ywd-hotspot`.

## ✅ Basic validation before pushing

Shell entry points:

```bash
bash -n \
  INSTALL.sh INSTALL-core.sh \
  UPDATE.sh UPDATE-core.sh \
  GITHUB-UPDATE.sh GITHUB-UPDATE-core.sh \
  MIGRATE-TO-GITHUB.sh MIGRATE-TO-GITHUB-core.sh \
  UNINSTALL.sh \
  bin/ywd-hotspotctl bin/ywd-hotspotctl-core bin/ywd-ui.sh \
  lab/mmdvm-diag.sh
```

Python:

```bash
python3 -m py_compile lib/*.py
```

If Node.js is available in the development environment:

```bash
node --check web/app.js
node --check web/app-core.js
node --check web/talkgroups.js
node --check web/ui-polish.js
```

Changes touching systemd, sudoers, config generation, install/update, or RF behavior still require a real Pi test before being considered known-good.

## 🧪 Test-build workflow

A practical development cycle is:

```text
dev change
   ↓
static validation
   ↓
sudo ywd-hotspotctl update --check
   ↓
sudo ywd-hotspotctl update --dry-run
   ↓
Pi Zero hardware test
   ↓
checkpoint branch when confirmed
   ↓
promote to main only when deliberately approved
```

Do not use `/opt/ywd-hotspot/repo` as a casual hacking tree. Work in a normal clone and let the managed updater keep its dirty-tree safety guard.

## 🛡️ Update trust boundary

Keep these protections unless a stronger replacement is demonstrated:

- canonical-origin verification
- dirty-content refusal
- candidate staging outside the live app
- required-file/syntax validation
- protected pre-update backup
- RF-state preservation
- managed checkout advanced only after successful deploy

Convenience is not a good reason to make update failures destructive.

## 📌 Upstream RF pins

Do not casually combine an MMDVM-Host/DMRGateway pin move with unrelated UI/docs work. A radio-stack pin change changes the calibration baseline and should be isolated and regression-tested.

Current pins live in:

```text
pins.env
```

## 🏷️ Tags and releases

The updater supports explicit tags:

```bash
sudo ywd-hotspotctl update --tag v0.1.0-alpha6
```

A checkpoint branch is useful while alpha builds are moving quickly; a release/tag should only be described as known-good after actual hardware testing.

## 🧾 Repository metadata

Suggested description:

```text
Lightweight Raspberry Pi + MMDVM DMR hotspot stack with BrandMeister controls, responsive WebUI, calibration, diagnostics and safe GitHub updates.
```

Suggested topics:

```text
ham-radio dmr mmdvm raspberry-pi raspberry-pi-zero brandmeister hotspot amateur-radio
```

## 📄 License

The repository uses the **[Unlicense](../LICENSE)** / public-domain dedication.
