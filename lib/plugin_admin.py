#!/usr/bin/env python3
"""Narrow privileged state/config helper for YWD-Hotspot Plugin API v1."""
from __future__ import annotations

import grp
import json
import os
import subprocess
import sys
from pathlib import Path

APP_LIB = Path("/opt/ywd-hotspot/app/lib")
if str(APP_LIB) not in sys.path:
    sys.path.insert(0, str(APP_LIB))

import plugin_manager


def payload():
    raw = sys.stdin.buffer.read(65536)
    if not raw:
        return {}
    try:
        data = json.loads(raw.decode("utf-8"))
    except Exception:
        raise ValueError("invalid JSON payload")
    if not isinstance(data, dict):
        raise ValueError("payload must be an object")
    return data


def ywd_gid():
    try:
        return grp.getgrnam("ywd-hotspot").gr_gid
    except Exception:
        return 0


def atomic_json(path, data, mode=0o640):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    os.chmod(path.parent, 0o750)
    try:
        os.chown(path.parent, 0, ywd_gid())
    except Exception:
        pass
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.chmod(tmp, mode)
    try:
        os.chown(tmp, 0, ywd_gid())
    except Exception:
        pass
    os.replace(tmp, path)


def run(args, timeout=20):
    return subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                          timeout=timeout, check=False)


def stop_plugin_service(plugin):
    service = plugin.get("service")
    if not service:
        return None
    p = run(["systemctl", "disable", "--now", service])
    if p.returncode != 0:
        return (p.stdout or f"failed to stop {service}").strip()[-500:]
    return None


def set_system(data):
    enabled = data.get("enabled")
    if not isinstance(enabled, bool):
        raise ValueError("enabled must be true or false")
    state = plugin_manager.read_state()
    disabled_plugins = []

    if not enabled:
        # Stop/unload every valid plugin before the master state is committed.
        # API v1 has no service-backed plugins yet, but this transaction order is
        # the contract later plugin APIs must preserve.
        errors = []
        for entry in plugin_manager.discover():
            if not entry.get("valid"):
                continue
            manifest = entry["manifest"]
            ident = manifest.get("id")
            if bool((state.get("plugins", {}).get(ident) or {}).get("enabled", False)):
                disabled_plugins.append(ident)
            error = stop_plugin_service(manifest)
            if error:
                errors.append(error)
        if errors:
            raise RuntimeError("could not safely stop all plugin services: " + "; ".join(errors)[:600])

        # Master OFF means fully disabled, not "armed". Keep configuration files,
        # but clear every per-plugin activation flag so re-enabling the subsystem
        # cannot silently reactivate anything.
        for ident in list(state.setdefault("plugins", {})):
            state["plugins"][ident] = {"enabled": False}

    state["enabled"] = enabled
    atomic_json(plugin_manager.STATE, state)
    return {"ok": True, "enabled": enabled, "disabled_plugins": disabled_plugins}


def set_plugin(data):
    ident = str(data.get("id") or "")
    enabled = data.get("enabled")
    if not isinstance(enabled, bool):
        raise ValueError("enabled must be true or false")
    plugin = plugin_manager.get_plugin(ident)
    state = plugin_manager.read_state()
    if enabled and not state.get("enabled"):
        raise ValueError("enable the plugin subsystem first")
    if enabled and plugin.get("service"):
        raise ValueError("service-backed plugins are not permitted by Plugin API v1")
    warning = None
    if not enabled:
        warning = stop_plugin_service(plugin)
        if warning:
            raise RuntimeError(warning)
    state.setdefault("plugins", {})[ident] = {"enabled": enabled}
    atomic_json(plugin_manager.STATE, state)
    return {"ok": True, "id": ident, "enabled": enabled}


def save_config(data):
    ident = str(data.get("id") or "")
    plugin = plugin_manager.get_plugin(ident)
    config = data.get("config")
    if not isinstance(config, dict):
        raise ValueError("config must be an object")
    clean = plugin_manager.normalize_config(plugin, config)
    atomic_json(plugin_manager.config_path(ident), clean)
    return {"ok": True, "id": ident, "config": plugin_manager.public_config(plugin, clean)}


def main():
    if os.geteuid() != 0:
        raise SystemExit("ywd-hotspot plugin admin must run as root")
    if len(sys.argv) != 2:
        raise SystemExit("usage: plugin_admin.py ACTION")
    action = sys.argv[1]
    data = payload()
    if action == "plugin-system-set":
        out = set_system(data)
    elif action == "plugin-set":
        out = set_plugin(data)
    elif action == "plugin-config-save":
        out = save_config(data)
    else:
        raise ValueError("unsupported plugin admin action")
    print(json.dumps(out, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)[:800]}, separators=(",", ":")))
        raise SystemExit(1)
