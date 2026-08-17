#!/usr/bin/env python3
"""Narrow privileged state/config/lifecycle helper for YWD-Hotspot plugins."""
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
import plugin_service_manager


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


def run(args, timeout=25):
    return subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                          timeout=timeout, check=False)


def run_systemctl(*args, timeout=25):
    p = run(["systemctl", *args], timeout=timeout)
    if p.returncode != 0:
        raise RuntimeError((p.stdout or f"systemctl {' '.join(args)} failed").strip()[-700:])
    return (p.stdout or "").strip()


def all_entries():
    return list(plugin_manager.discover()) + list(plugin_service_manager.discover())


def resolve_plugin(ident):
    ident = str(ident or "")
    try:
        return plugin_manager.get_plugin(ident), "declarative"
    except plugin_manager.PluginError:
        return plugin_service_manager.get_plugin(ident), "service"


def stop_plugin_service(plugin, disable=True):
    service = plugin.get("service")
    if not service:
        return
    action = ["disable", "--now", service] if disable else ["stop", service]
    run_systemctl(*action)


def set_system(data):
    enabled = data.get("enabled")
    if not isinstance(enabled, bool):
        raise ValueError("enabled must be true or false")
    state = plugin_manager.read_state()
    disabled_plugins = []

    if not enabled:
        # Stop/unload every valid service before committing master OFF. If any
        # service refuses to stop, fail the whole operation rather than claim a
        # false-safe disabled state.
        for entry in all_entries():
            if not entry.get("valid"):
                continue
            manifest = entry["manifest"]
            ident = manifest.get("id")
            desired = bool((state.get("plugins", {}).get(ident) or {}).get("enabled", False))
            if desired:
                disabled_plugins.append(ident)
            if manifest.get("service"):
                stop_plugin_service(manifest, disable=True)

        # Master OFF means fully disabled. Configuration files remain, but no
        # activation flag survives to auto-start later.
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
    plugin, kind = resolve_plugin(ident)
    state = plugin_manager.read_state()
    if enabled and not state.get("enabled"):
        raise ValueError("enable the plugin subsystem first")

    if kind == "service":
        if enabled:
            run_systemctl("enable", "--now", plugin["service"])
        else:
            stop_plugin_service(plugin, disable=True)

    state.setdefault("plugins", {})[ident] = {"enabled": enabled}
    atomic_json(plugin_manager.STATE, state)
    return {"ok": True, "id": ident, "enabled": enabled, "service": plugin.get("service")}


def save_config(data):
    ident = str(data.get("id") or "")
    plugin, kind = resolve_plugin(ident)
    config = data.get("config")
    if not isinstance(config, dict):
        raise ValueError("config must be an object")
    clean = plugin_manager.normalize_config(plugin, config)
    atomic_json(plugin_manager.config_path(ident), clean)
    restart_required = False
    if kind == "service":
        restart_required = plugin_service_manager.runtime_state(plugin["service"]).get("state") == "active"
    return {
        "ok": True,
        "id": ident,
        "config": plugin_manager.public_config(plugin, clean),
        "restart_required": restart_required,
    }


def runtime_action(data):
    ident = str(data.get("id") or "")
    action = str(data.get("action") or "")
    if action not in {"start", "stop", "restart"}:
        raise ValueError("runtime action must be start, stop, or restart")
    plugin = plugin_service_manager.get_plugin(ident)
    state = plugin_manager.read_state()
    if not state.get("enabled"):
        raise ValueError("plugin subsystem is disabled")
    if not bool((state.get("plugins", {}).get(ident) or {}).get("enabled", False)):
        raise ValueError("enable the service plugin first")
    run_systemctl(action, plugin["service"])
    return {
        "ok": True,
        "id": ident,
        "action": action,
        "service": plugin["service"],
        "runtime": plugin_service_manager.runtime_state(plugin["service"]),
    }


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
    elif action == "plugin-runtime":
        out = runtime_action(data)
    else:
        raise ValueError("unsupported plugin admin action")
    print(json.dumps(out, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)[:800]}, separators=(",", ":")))
        raise SystemExit(1)
