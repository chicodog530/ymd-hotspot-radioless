#!/usr/bin/env python3
"""Fail-closed declarative plugin catalog for YWD-Hotspot.

Plugin API v1 intentionally does not import or execute plugin Python/JavaScript.
Bundled first-party plugins are manifest + schema packages interpreted by this
trusted core.  This establishes discovery/config/lifecycle UI safely before
service-backed or RF-mode plugins are permitted in a later API revision.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

API_VERSION = 1
LIB = Path(__file__).resolve().parent
CATALOG = Path(os.environ.get("YWD_PLUGIN_CATALOG", str(LIB / "plugin_packages")))
STATE = Path(os.environ.get("YWD_PLUGIN_STATE", "/etc/ywd-hotspot/plugin-state.json"))
CONFIG_DIR = Path(os.environ.get("YWD_PLUGIN_CONFIG_DIR", "/etc/ywd-hotspot/plugins"))

ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
FIELD_RE = re.compile(r"^[a-z][a-z0-9_]{0,39}$")
SERVICE_RE = re.compile(r"^ywd-plugin-[a-z0-9][a-z0-9-]{0,39}\.service$")
ALLOWED_TRUST = {"first-party", "experimental"}
ALLOWED_KINDS = {"declarative"}
ALLOWED_PROVIDERS = {"system-summary"}
ALLOWED_CAPABILITIES = {"read:system-summary"}
ALLOWED_FIELD_TYPES = {"string", "boolean", "integer", "select"}
MANIFEST_KEYS = {
    "api", "id", "name", "version", "description", "trust", "kind", "provider",
    "capabilities", "rf_mode", "service", "config_schema",
}
FIELD_KEYS = {"key", "type", "label", "default", "min", "max", "max_length", "options", "help", "secret"}


class PluginError(ValueError):
    pass


def _read_json(path, default=None):
    try:
        value = json.loads(Path(path).read_text(encoding="utf-8"))
        return value
    except Exception:
        return default


def _clean_text(value, field, limit, required=True):
    text = str(value or "").strip()
    if required and not text:
        raise PluginError(f"manifest {field} is required")
    if len(text) > limit:
        raise PluginError(f"manifest {field} is too long")
    return text


def default_state():
    return {"schema": 1, "enabled": False, "plugins": {}}


def read_state():
    raw = _read_json(STATE, {})
    if not isinstance(raw, dict):
        return default_state()
    plugins = raw.get("plugins") if isinstance(raw.get("plugins"), dict) else {}
    clean = {}
    for key, value in plugins.items():
        if ID_RE.fullmatch(str(key)) and isinstance(value, dict):
            clean[str(key)] = {"enabled": bool(value.get("enabled", False))}
    return {"schema": 1, "enabled": bool(raw.get("enabled", False)), "plugins": clean}


def _safe_child(directory, filename):
    name = str(filename or "")
    if not name or Path(name).name != name:
        raise PluginError("plugin file reference must be a simple filename")
    return directory / name


def validate_schema(plugin_dir, filename):
    path = _safe_child(plugin_dir, filename)
    raw = _read_json(path)
    if not isinstance(raw, dict):
        raise PluginError(f"invalid configuration schema: {filename}")
    if raw.get("schema") != 1:
        raise PluginError("configuration schema must be version 1")
    fields = raw.get("fields")
    if not isinstance(fields, list) or len(fields) > 40:
        raise PluginError("configuration schema fields must be a list of at most 40 entries")
    out = []
    seen = set()
    for item in fields:
        if not isinstance(item, dict):
            raise PluginError("configuration field must be an object")
        unknown = set(item) - FIELD_KEYS
        if unknown:
            raise PluginError(f"configuration field has unknown keys: {', '.join(sorted(unknown))}")
        key = str(item.get("key") or "")
        if not FIELD_RE.fullmatch(key) or key in seen:
            raise PluginError(f"invalid or duplicate configuration field: {key or '?'}")
        seen.add(key)
        kind = str(item.get("type") or "")
        if kind not in ALLOWED_FIELD_TYPES:
            raise PluginError(f"unsupported configuration field type: {kind or '?'}")
        label = _clean_text(item.get("label"), "configuration label", 80)
        field = {"key": key, "type": kind, "label": label, "secret": bool(item.get("secret", False))}
        help_text = str(item.get("help") or "").strip()
        if help_text:
            field["help"] = help_text[:240]
        if kind == "string":
            maximum = int(item.get("max_length", 120))
            if not 1 <= maximum <= 500:
                raise PluginError(f"invalid max_length for {key}")
            field["max_length"] = maximum
            field["default"] = str(item.get("default", ""))[:maximum]
        elif kind == "boolean":
            field["default"] = bool(item.get("default", False))
        elif kind == "integer":
            minimum = int(item.get("min", -2147483648)); maximum = int(item.get("max", 2147483647))
            if minimum > maximum:
                raise PluginError(f"invalid integer range for {key}")
            default = int(item.get("default", minimum if minimum > 0 else 0))
            if not minimum <= default <= maximum:
                raise PluginError(f"default for {key} is outside its range")
            field.update({"min": minimum, "max": maximum, "default": default})
        else:
            options = item.get("options")
            if not isinstance(options, list) or not 1 <= len(options) <= 20:
                raise PluginError(f"select field {key} must define 1-20 options")
            clean_options = []
            for option in options:
                text = str(option).strip()
                if not text or len(text) > 80:
                    raise PluginError(f"invalid option in {key}")
                clean_options.append(text)
            default = str(item.get("default", clean_options[0]))
            if default not in clean_options:
                raise PluginError(f"default for {key} is not an allowed option")
            field.update({"options": clean_options, "default": default})
        out.append(field)
    return {"schema": 1, "fields": out}


def validate_manifest(path):
    plugin_dir = Path(path).parent
    raw = _read_json(path)
    if not isinstance(raw, dict):
        raise PluginError("plugin manifest is not valid JSON")
    unknown = set(raw) - MANIFEST_KEYS
    if unknown:
        raise PluginError(f"manifest has unknown keys: {', '.join(sorted(unknown))}")
    if raw.get("api") != API_VERSION:
        raise PluginError(f"plugin API must be {API_VERSION}")
    ident = str(raw.get("id") or "")
    if not ID_RE.fullmatch(ident) or plugin_dir.name != ident:
        raise PluginError("plugin id must match its directory and contain only lowercase letters, numbers, and hyphens")
    name = _clean_text(raw.get("name"), "name", 80)
    version = _clean_text(raw.get("version"), "version", 40)
    description = _clean_text(raw.get("description"), "description", 500)
    trust = str(raw.get("trust") or "")
    kind = str(raw.get("kind") or "")
    provider = str(raw.get("provider") or "")
    if trust not in ALLOWED_TRUST:
        raise PluginError("unsupported plugin trust level")
    if kind not in ALLOWED_KINDS:
        raise PluginError("Plugin API v1 only permits declarative plugins")
    if provider not in ALLOWED_PROVIDERS:
        raise PluginError("unsupported declarative provider")
    caps = raw.get("capabilities")
    if not isinstance(caps, list) or any(str(x) not in ALLOWED_CAPABILITIES for x in caps):
        raise PluginError("manifest contains an unsupported capability")
    caps = list(dict.fromkeys(str(x) for x in caps))
    service = raw.get("service")
    if service is not None:
        service = str(service)
        if not SERVICE_RE.fullmatch(service) or service != f"ywd-plugin-{ident}.service":
            raise PluginError("plugin service must use the ywd-plugin-<id>.service naming contract")
        raise PluginError("service-backed plugins are not enabled in Plugin API v1")
    schema_name = str(raw.get("config_schema") or "")
    schema = validate_schema(plugin_dir, schema_name)
    return {
        "api": API_VERSION, "id": ident, "name": name, "version": version,
        "description": description, "trust": trust, "kind": kind, "provider": provider,
        "capabilities": caps, "rf_mode": bool(raw.get("rf_mode", False)), "service": None,
        "config_schema": schema_name, "schema": schema, "directory": plugin_dir,
    }


def discover():
    found = []
    if not CATALOG.is_dir():
        return found
    for directory in sorted((x for x in CATALOG.iterdir() if x.is_dir()), key=lambda x: x.name):
        manifest_path = directory / "plugin.json"
        if not manifest_path.is_file():
            continue
        try:
            found.append({"valid": True, "manifest": validate_manifest(manifest_path), "error": None})
        except Exception as exc:
            ident = directory.name if ID_RE.fullmatch(directory.name) else "invalid-package"
            found.append({"valid": False, "manifest": {"id": ident, "name": directory.name, "version": "unknown", "directory": directory}, "error": str(exc)[:500]})
    return found


def get_plugin(ident):
    ident = str(ident or "")
    if not ID_RE.fullmatch(ident):
        raise PluginError("invalid plugin id")
    for entry in discover():
        if entry["manifest"].get("id") == ident:
            if not entry["valid"]:
                raise PluginError(entry["error"] or "plugin manifest is invalid")
            return entry["manifest"]
    raise PluginError("plugin is not installed")


def config_path(ident):
    if not ID_RE.fullmatch(str(ident or "")):
        raise PluginError("invalid plugin id")
    return CONFIG_DIR / f"{ident}.json"


def normalize_config(plugin, incoming=None):
    schema = plugin["schema"]
    if incoming is None:
        incoming = _read_json(config_path(plugin["id"]), {})
    if not isinstance(incoming, dict):
        raise PluginError("plugin configuration must be an object")
    allowed = {f["key"] for f in schema["fields"]}
    unknown = set(incoming) - allowed
    if unknown:
        raise PluginError(f"unknown plugin configuration keys: {', '.join(sorted(unknown))}")
    out = {}
    for field in schema["fields"]:
        key = field["key"]
        value = incoming.get(key, field.get("default"))
        kind = field["type"]
        if kind == "boolean":
            if not isinstance(value, bool):
                raise PluginError(f"{key} must be true or false")
        elif kind == "integer":
            if isinstance(value, bool):
                raise PluginError(f"{key} must be an integer")
            try: value = int(value)
            except Exception: raise PluginError(f"{key} must be an integer")
            if not field["min"] <= value <= field["max"]:
                raise PluginError(f"{key} must be between {field['min']} and {field['max']}")
        elif kind == "select":
            value = str(value)
            if value not in field["options"]:
                raise PluginError(f"{key} is not an allowed option")
        else:
            value = str(value)
            if len(value) > field["max_length"]:
                raise PluginError(f"{key} must be {field['max_length']} characters or fewer")
        out[key] = value
    return out


def public_config(plugin, config):
    out = {}
    for field in plugin["schema"]["fields"]:
        key = field["key"]
        if field.get("secret"):
            out[key] = {"configured": bool(config.get(key))}
        else:
            out[key] = config.get(key, field.get("default"))
    return out


def provider_data(plugin, config, system_summary=None):
    if plugin.get("provider") != "system-summary":
        return {}
    system = system_summary if isinstance(system_summary, dict) else {}
    out = {"label": config.get("label", "Framework online"), "hostname": system.get("hostname")}
    if config.get("show_uptime", True): out["uptime_s"] = system.get("uptime_s")
    if config.get("show_temperature", True): out["temperature_c"] = system.get("temperature_c")
    if config.get("show_load", False): out["load"] = system.get("load")
    return out


def snapshot(system_summary=None):
    state = read_state()
    packages = []
    active = 0
    enabled_count = 0
    for entry in discover():
        manifest = entry["manifest"]
        ident = manifest.get("id", "invalid-package")
        desired = bool((state.get("plugins", {}).get(ident) or {}).get("enabled", False))
        if desired: enabled_count += 1
        effective = bool(state["enabled"] and desired and entry["valid"])
        if effective: active += 1
        item = {
            "id": ident, "name": manifest.get("name", ident), "version": manifest.get("version", "unknown"),
            "valid": bool(entry["valid"]), "error": entry.get("error"), "enabled": desired,
            "effective_enabled": effective, "health": "error" if not entry["valid"] else ("active" if effective else "disabled"),
        }
        if entry["valid"]:
            try:
                config = normalize_config(manifest)
                config_error = None
            except Exception as exc:
                config = normalize_config(manifest, {})
                config_error = str(exc)[:400]
                item["health"] = "error"
            item.update({
                "description": manifest["description"], "trust": manifest["trust"], "kind": manifest["kind"],
                "provider": manifest["provider"], "capabilities": manifest["capabilities"], "rf_mode": manifest["rf_mode"],
                "service": manifest["service"], "schema": manifest["schema"], "config": public_config(manifest, config),
                "config_error": config_error,
            })
            if effective and not config_error:
                item["data"] = provider_data(manifest, config, system_summary)
        packages.append(item)
    health = "disabled" if not state["enabled"] else ("error" if any(x["health"] == "error" for x in packages) else "good")
    return {
        "api": API_VERSION,
        "system": {
            "enabled": state["enabled"], "health": health, "installed": len(packages),
            "enabled_plugins": enabled_count, "active_plugins": active,
            "execution_model": "declarative-only",
        },
        "plugins": packages,
    }


def test_plugin(ident, system_summary=None):
    state = read_state(); plugin = get_plugin(ident)
    desired = bool((state.get("plugins", {}).get(plugin["id"]) or {}).get("enabled", False))
    if not state["enabled"]:
        raise PluginError("plugin subsystem is disabled")
    if not desired:
        raise PluginError("plugin is disabled")
    config = normalize_config(plugin)
    return {
        "ok": True, "id": plugin["id"], "health": "pass",
        "message": "Declarative provider test passed; no plugin code was executed.",
        "data": provider_data(plugin, config, system_summary),
    }


def managed_services():
    # Reserved for a later API revision. Validation currently rejects non-null
    # service declarations, so v1 always returns an empty list.
    return []
