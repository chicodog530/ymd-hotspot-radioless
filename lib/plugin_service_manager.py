#!/usr/bin/env python3
"""Sandboxed service-plugin discovery/status for YWD-Hotspot.

This module is trusted core. Service plugins may execute only through the single
hardened ywd-plugin@.service template and may not supply their own unit files.
RF/device/network access is intentionally unavailable in this phase.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path

import plugin_manager

API_VERSION = 1
LIB = Path(__file__).resolve().parent
CATALOG = Path(os.environ.get("YWD_SERVICE_PLUGIN_CATALOG", str(LIB / "service_plugin_packages")))
ALLOWED_TRUST = {"first-party", "experimental"}
ALLOWED_KINDS = {"service"}
ALLOWED_CAPABILITIES = {"service:lifecycle", "read:journal"}
MANIFEST_KEYS = {
    "api", "id", "name", "version", "description", "trust", "kind",
    "capabilities", "rf_mode", "entrypoint", "config_schema",
}
ENTRY_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}\.py$")


class ServicePluginError(plugin_manager.PluginError):
    pass


def _read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception:
        return None


def _text(value, field, limit):
    text = str(value or "").strip()
    if not text:
        raise ServicePluginError(f"manifest {field} is required")
    if len(text) > limit:
        raise ServicePluginError(f"manifest {field} is too long")
    return text


def unit_name(ident):
    ident = str(ident or "")
    if not plugin_manager.ID_RE.fullmatch(ident):
        raise ServicePluginError("invalid service plugin id")
    return f"ywd-plugin@{ident}.service"


def validate_manifest(path):
    path = Path(path)
    directory = path.parent
    raw = _read_json(path)
    if not isinstance(raw, dict):
        raise ServicePluginError("service plugin manifest is not valid JSON")
    unknown = set(raw) - MANIFEST_KEYS
    if unknown:
        raise ServicePluginError(f"service manifest has unknown keys: {', '.join(sorted(unknown))}")
    if raw.get("api") != API_VERSION:
        raise ServicePluginError(f"service plugin API must be {API_VERSION}")
    ident = str(raw.get("id") or "")
    if not plugin_manager.ID_RE.fullmatch(ident) or directory.name != ident:
        raise ServicePluginError("service plugin id must match its directory")
    for entry in plugin_manager.discover():
        if entry.get("manifest", {}).get("id") == ident:
            raise ServicePluginError("plugin id collides with a declarative plugin")
    name = _text(raw.get("name"), "name", 80)
    version = _text(raw.get("version"), "version", 40)
    description = _text(raw.get("description"), "description", 500)
    trust = str(raw.get("trust") or "")
    kind = str(raw.get("kind") or "")
    if trust not in ALLOWED_TRUST:
        raise ServicePluginError("unsupported service-plugin trust level")
    if kind not in ALLOWED_KINDS:
        raise ServicePluginError("service plugin kind must be 'service'")
    if bool(raw.get("rf_mode", False)):
        raise ServicePluginError("RF-mode ownership is not permitted in the service-plugin phase")
    caps = raw.get("capabilities")
    if not isinstance(caps, list) or any(str(x) not in ALLOWED_CAPABILITIES for x in caps):
        raise ServicePluginError("service manifest contains an unsupported capability")
    caps = list(dict.fromkeys(str(x) for x in caps))
    entrypoint = str(raw.get("entrypoint") or "")
    if not ENTRY_RE.fullmatch(entrypoint) or Path(entrypoint).name != entrypoint:
        raise ServicePluginError("service entrypoint must be a simple .py filename")
    entry_path = directory / entrypoint
    if not entry_path.is_file() or entry_path.stat().st_size > 131072:
        raise ServicePluginError("service entrypoint is missing or too large")
    schema_name = str(raw.get("config_schema") or "")
    schema = plugin_manager.validate_schema(directory, schema_name)
    return {
        "api": API_VERSION,
        "id": ident,
        "name": name,
        "version": version,
        "description": description,
        "trust": trust,
        "kind": kind,
        "capabilities": caps,
        "rf_mode": False,
        "service": unit_name(ident),
        "entrypoint": entrypoint,
        "config_schema": schema_name,
        "schema": schema,
        "directory": directory,
    }


def discover():
    rows = []
    if not CATALOG.is_dir():
        return rows
    for directory in sorted((p for p in CATALOG.iterdir() if p.is_dir()), key=lambda p: p.name):
        manifest_path = directory / "plugin.json"
        if not manifest_path.is_file():
            continue
        try:
            rows.append({"valid": True, "manifest": validate_manifest(manifest_path), "error": None})
        except Exception as exc:
            ident = directory.name if plugin_manager.ID_RE.fullmatch(directory.name) else "invalid-package"
            rows.append({
                "valid": False,
                "manifest": {"id": ident, "name": directory.name, "version": "unknown", "directory": directory},
                "error": str(exc)[:500],
            })
    return rows


def get_plugin(ident):
    ident = str(ident or "")
    if not plugin_manager.ID_RE.fullmatch(ident):
        raise ServicePluginError("invalid service plugin id")
    for entry in discover():
        if entry.get("manifest", {}).get("id") == ident:
            if not entry.get("valid"):
                raise ServicePluginError(entry.get("error") or "service plugin is invalid")
            return entry["manifest"]
    raise ServicePluginError("service plugin is not installed")


def _run(args, timeout=4):
    try:
        p = subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                           timeout=timeout, check=False)
        return (p.stdout or "").strip()
    except Exception:
        return ""


def runtime_state(unit):
    active = _run(["systemctl", "is-active", unit], 3) or "unknown"
    enabled = _run(["systemctl", "is-enabled", unit], 3) or "disabled"
    return {"state": active, "boot": enabled}


def normalize_config(plugin, incoming=None):
    return plugin_manager.normalize_config(plugin, incoming)


def public_config(plugin, config):
    return plugin_manager.public_config(plugin, config)


def snapshot():
    state = plugin_manager.read_state()
    packages = []
    for entry in discover():
        manifest = entry["manifest"]
        ident = manifest.get("id", "invalid-package")
        desired = bool((state.get("plugins", {}).get(ident) or {}).get("enabled", False))
        effective = bool(state.get("enabled") and desired and entry.get("valid"))
        item = {
            "id": ident,
            "name": manifest.get("name", ident),
            "version": manifest.get("version", "unknown"),
            "valid": bool(entry.get("valid")),
            "error": entry.get("error"),
            "enabled": desired,
            "effective_enabled": effective,
            "health": "error" if not entry.get("valid") else "disabled",
        }
        if entry.get("valid"):
            runtime = runtime_state(manifest["service"])
            try:
                config = normalize_config(manifest)
                config_error = None
            except Exception as exc:
                config = normalize_config(manifest, {})
                config_error = str(exc)[:400]
            if effective:
                item["health"] = "active" if runtime["state"] == "active" else "stopped"
            if config_error:
                item["health"] = "error"
            item.update({
                "description": manifest["description"],
                "trust": manifest["trust"],
                "kind": manifest["kind"],
                "provider": "sandboxed-service",
                "capabilities": manifest["capabilities"],
                "rf_mode": False,
                "service": manifest["service"],
                "schema": manifest["schema"],
                "config": public_config(manifest, config),
                "config_error": config_error,
                "runtime": runtime,
            })
        packages.append(item)
    return packages


def test_plugin(ident):
    state = plugin_manager.read_state()
    plugin = get_plugin(ident)
    desired = bool((state.get("plugins", {}).get(plugin["id"]) or {}).get("enabled", False))
    if not state.get("enabled"):
        raise ServicePluginError("plugin subsystem is disabled")
    if not desired:
        raise ServicePluginError("service plugin is disabled")
    runtime = runtime_state(plugin["service"])
    if runtime["state"] != "active":
        raise ServicePluginError(f"service is {runtime['state']}")
    return {
        "ok": True,
        "id": plugin["id"],
        "health": "pass",
        "message": "Sandboxed service is active under the shared YWD plugin unit template.",
        "data": {"service": plugin["service"], **runtime},
    }
