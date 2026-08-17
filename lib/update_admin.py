#!/usr/bin/env python3
"""Narrow privileged bridge for authenticated WebUI software updates."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

APP = Path("/opt/ywd-hotspot/app")
LIB = APP / "lib"
if str(LIB) not in sys.path:
    sys.path.insert(0, str(LIB))

import config_model
import admin as core_admin

CFG = Path("/etc/ywd-hotspot/config.json")
APPLIED_STATE = Path("/var/lib/ywd-hotspot/applied-state.json")
RUNNER = Path("/usr/local/libexec/ywd-update-runner")
SERVICE = "ywd-update.service"


def run(args, timeout=30):
    return subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          timeout=timeout, check=False)


def pending_config():
    try:
        c = config_model.normalize(json.loads(CFG.read_text()))
        a = json.loads(APPLIED_STATE.read_text())
        return a.get("hash") != config_model.hash_config(c, include_secrets=False)
    except Exception:
        return True


def service_active():
    return run(["systemctl", "is-active", "--quiet", SERVICE], 5).returncode == 0


def runner_check():
    if not RUNNER.is_file():
        raise RuntimeError("WebUI update runner is not installed")
    p = run([str(RUNNER), "check"], 210)
    raw = (p.stdout or "").strip()
    try:
        out = json.loads(raw.splitlines()[-1]) if raw else {}
    except Exception:
        out = {}
    if p.returncode != 0 or not out.get("ok"):
        raise RuntimeError(str(out.get("error") or p.stderr.strip() or raw or "update check failed")[:800])
    return out


def update_check():
    if service_active():
        raise ValueError("an update is already running")
    out = runner_check()
    out["pending_config"] = pending_config()
    if out["pending_config"]:
        out["blocked_reason"] = "Configuration has saved-but-not-applied changes"
    return out


def update_start():
    if service_active():
        raise ValueError("an update is already running")
    if pending_config():
        raise ValueError("Configuration has saved-but-not-applied changes; apply or revert them before updating")
    check = runner_check()
    if check.get("up_to_date") or not check.get("available"):
        return {"ok": True, "started": False, "up_to_date": True, **check}
    p = run(["systemctl", "start", "--no-block", SERVICE], 10)
    if p.returncode != 0:
        raise RuntimeError((p.stderr or p.stdout or "could not start update service").strip()[:800])
    core_admin.audit("software-update-start", {
        "channel": check.get("channel"),
        "target_commit": check.get("target_commit"),
        "target_version": check.get("target_version"),
    })
    return {"ok": True, "started": True, **check}


def main():
    if os.geteuid() != 0:
        raise SystemExit("ywd-hotspot-update-admin must run as root")
    if len(sys.argv) != 2:
        raise SystemExit("usage: ywd-hotspot-update-admin ACTION")
    action = sys.argv[1]
    if action == "update-check":
        out = update_check()
    elif action == "update-start":
        out = update_start()
    else:
        raise ValueError("unsupported update admin action")
    print(json.dumps(out, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)[:800]}, separators=(",", ":")))
        raise SystemExit(1)
