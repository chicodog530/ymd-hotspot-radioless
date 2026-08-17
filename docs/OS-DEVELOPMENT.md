# YWD-Hotspot OS development

[Project README](../README.md) · [OS builder](../os/README.md) · [Architecture](ARCHITECTURE.md)

YWD-Hotspot keeps the application and appliance-image source in one repository while preserving a strict runtime boundary: normal installs and updates do not depend on `os/`, but fresh images are built from the exact application commit that contains the OS builder.

## Branch model

Normal application development stays on `dev`. Large OS changes should use a temporary branch cut from the current `dev`, be physically validated, and then merge back as focused source changes.

```text
main
  └─ dev
      ├─ known-good checkpoints
      ├─ temporary dev-os-* integration branches
      └─ future feature branches such as dev-plugins
```

The historical long-lived `dev-os` branch is reference/history. Do not merge it wholesale into current `dev`.

## Current integration workflow

The unified source work was started from current `dev` on `dev-os-integrate`. The proven `os/` subtree was imported, then modernized so the image consumes current root application assets instead of stale copies.

Important changes in the unified builder:

- `os/builder/BUILD.sh` is the canonical entry point.
- `BUILD-M4.sh` is only a compatibility alias.
- tracked uncommitted source blocks a build.
- root `VERSION`, app code, WebUI, services and helper layout are packaged from the current commit.
- root `lib/oled.py` is injected as the headless OLED renderer.
- root console/branding assets are injected into the image polish stage.
- factory config is generated from current `lib/config_model.py` rather than a hand-maintained old schema copy.
- first-boot installs current split admin/setup/update helper paths.
- the managed Git checkout uses a full branch refspec.
- experimental build branches fall back to `dev` as the future normal application update channel.

## Build

On the builder:

```bash
cd ~/ywd-hotspot   # or the repository checkout you use for image builds
git status --short
git branch --show-current
bash os/builder/DOCTOR.sh
bash os/builder/BUILD.sh
```

The builder runs syntax/preflight checks before pi-gen and caps MMDVM-Host/DMRGateway compilation at four jobs.

Build-time Wi-Fi remains optional:

```bash
bash os/builder/CONFIGURE-WIFI.sh
```

Local credentials, SSH keys, work directories, pi-gen checkout and deploy images are ignored under `os/local`, `os/work`, `os/.pi-gen` and `os/deploy`.

## Physical acceptance checklist

Do not merge an OS integration branch back to `dev` merely because the image compiled. Validate the target appliance:

```text
[ ] builder doctor passes
[ ] image build completes
[ ] xz integrity test passes
[ ] Pi Zero boots
[ ] OLED boot/network screens work
[ ] setup AP appears without station Wi-Fi
[ ] Wi-Fi handoff works
[ ] secure :8443 wizard accepts OLED code
[ ] current WebUI loads
[ ] unlock/auth works
[ ] settings/config apply works
[ ] BrandMeister connects
[ ] RF can be explicitly enabled
[ ] handheld -> hotspot RX works
[ ] hotspot -> handheld TX works
[ ] Parrot succeeds
[ ] normal talkgroup RX succeeds
[ ] ywd-headless-oled.service active
[ ] ywd-oled.service inactive
[ ] reboot preserves setup/config
[ ] CLI update check/dry-run works
[ ] About-page application update works
```

An image build is an installation artifact, not the ongoing application update mechanism. Once installed, YWD-Hotspot should continue receiving normal application updates from the saved `main` or `dev` channel without another SD-card image build.

## Promotion

After physical validation:

1. merge the focused `dev-os-integrate` source into `dev`
2. freeze a new integrated known-good checkpoint
3. leave the historical `dev-os` branch untouched for reference
4. branch experimental work such as `dev-plugins` from the new unified `dev`

This avoids carrying two divergent application trees while keeping risky image work away from the daily-driver development branch until it is proven.
