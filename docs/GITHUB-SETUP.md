# GitHub Repository / Development Notes

Canonical repository:

```text
https://github.com/merberg-ai/ywd-hotspot
```

Default development branch:

```text
main
```

## Clone

```bash
git clone https://github.com/merberg-ai/ywd-hotspot.git
cd ywd-hotspot
```

Normalize executable bits when working from a ZIP/Windows copy:

```bash
chmod +x INSTALL.sh UPDATE.sh UNINSTALL.sh GITHUB-UPDATE.sh MIGRATE-TO-GITHUB.sh
chmod +x bin/ywd-hotspotctl lab/mmdvm-diag.sh lib/*.py
```

For Git commits from Linux/WSL/Pi, preserve executable bits:

```bash
git update-index --chmod=+x INSTALL.sh UPDATE.sh UNINSTALL.sh GITHUB-UPDATE.sh MIGRATE-TO-GITHUB.sh
git update-index --chmod=+x bin/ywd-hotspotctl lab/mmdvm-diag.sh
git update-index --chmod=+x lib/*.py
```

`.gitattributes` forces important text/source files to LF endings.

## Runtime source model

A deployed hotspot does not run directly out of `.git`:

```text
/opt/ywd-hotspot/repo    managed Git checkout
/opt/ywd-hotspot/app     deployed runtime copy
```

This separation is deliberate. Git/network operations occur before the deployed runtime is changed.

`/etc/ywd-hotspot/build-info.json` records the branch/ref, commit, commit date and source state used for the deployed runtime. The WebUI header/About page and `ywd-hotspotctl source` expose that non-secret provenance.

## Do not commit runtime secrets

Never commit or attach:

- real `/etc/ywd-hotspot/config.json`
- `/etc/ywd-hotspot/bm-api.key`
- `/etc/ywd-hotspot/web-auth.json`
- protected backups from `/var/backups/ywd-hotspot`
- private runtime/config-history snapshots
- arbitrary unsanitized diagnostic archives

Runtime configuration belongs outside the repository under `/etc/ywd-hotspot` and `/var/lib/ywd-hotspot`.

## Basic validation before pushing

```bash
bash -n INSTALL.sh UPDATE.sh UNINSTALL.sh GITHUB-UPDATE.sh MIGRATE-TO-GITHUB.sh
bash -n bin/ywd-hotspotctl lab/mmdvm-diag.sh
python3 -m py_compile lib/*.py
```

If Node.js happens to be installed in the development environment, syntax-check the dashboard JavaScript too:

```bash
node --check web/app.js
```

Changes to systemd, sudoers, config generation, install/update or RF behavior still need an actual Pi test before being treated as a known-good release.

## Update-development warning

The deployment updater trusts only the canonical YWD-Hotspot origin and refuses dirty `/opt/ywd-hotspot/repo` working trees. Do not weaken those checks merely to make local experimentation easier.

For source hacking, use a normal development clone and manually apply a deliberate test build rather than modifying the managed production checkout.

## Tags/releases

`main` is the active development stream during alpha work. The update system also supports explicit tags:

```bash
sudo ywd-hotspotctl update --tag v0.1.0-alpha6
```

Only create/tag a release as known-good after it has actually passed the project test checkpoint. `0.1.0-alpha4.1` remains the last explicitly confirmed known-good checkpoint unless a later build is separately confirmed.

## Repository metadata

Suggested description:

```text
Lightweight Raspberry Pi + MMDVM DMR hotspot stack with BrandMeister controls, web UI, diagnostics, calibration and safe GitHub updates.
```

Suggested topics:

```text
ham-radio dmr mmdvm raspberry-pi raspberry-pi-zero brandmeister hotspot amateur-radio
```

## License

The repository includes the Unlicense/public-domain dedication in `LICENSE`.
