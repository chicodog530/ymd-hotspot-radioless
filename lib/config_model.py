#!/usr/bin/env python3
"""YWD-Hotspot canonical configuration normalization, validation and redaction."""
from __future__ import annotations

import copy
import hashlib
import ipaddress
import json
import re
from pathlib import Path

SCHEMA = 3
CALL_RE = re.compile(r"^[A-Z0-9]{3,10}(?:-[A-Z0-9]{1,2})?$")
HOST_RE = re.compile(r"^[A-Za-z0-9.-]+$")


def defaults() -> dict:
    return {
        "schema": SCHEMA,
        "station": {
            "callsign": "NOCALL",
            "base_dmr_id": "",
            "essid": "01",
            "hotspot_id": 0,
            "location": "Hotspot",
            "description": "YWD Hotspot",
            "latitude": 0.0,
            "longitude": 0.0,
            "height": 0,
            "url": "",
        },
        "radio": {
            "frequency_hz": 446525000,
            "color_code": 1,
            "rx_offset": 0,
            "tx_offset": 0,
            "tx_invert": 1,
            "rx_invert": 0,
            "rx_level": 50,
            "tx_level": 50,
            "rf_level": 100,
            "jitter_ms": 360,
            "call_hang_s": 3,
            "tx_hang_s": 4,
            "timeout_s": 180,
            "uart": "/dev/serial0",
            "uart_speed": 115200,
        },
        "brandmeister": {
            "enabled": True,
            "master": "3103.master.brandmeister.network",
            "port": 62031,
            "password": "",
        },
        "display": {
            "enabled": True,
            "i2c_bus": 1,
            "address": "0x3c",
            "brightness": 127,
            "idle_timeout_s": 0,
        },
        "web": {
            "bind": "0.0.0.0",
            "port": 8080,
        },
        "maintenance": {
            "rf_autostart": False,
            "persistent_journal": True,
            "journal_max_mb": 100,
            "dmrid_update_days": 7,
            "config_history_keep": 10,
        },
    }


def deep_merge(base: dict, incoming: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (incoming or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def _int(v, name, lo, hi):
    try:
        n = int(v)
    except Exception:
        raise ValueError(f"{name} must be an integer")
    if not lo <= n <= hi:
        raise ValueError(f"{name} must be between {lo} and {hi}")
    return n


def _float(v, name, lo, hi):
    try:
        n = float(v)
    except Exception:
        raise ValueError(f"{name} must be a number")
    if not lo <= n <= hi:
        raise ValueError(f"{name} must be between {lo} and {hi}")
    return n


def _text(v, name, maxlen=160, allow_empty=True):
    s = str(v if v is not None else "").replace("\r", " ").replace("\n", " ").strip()
    if not allow_empty and not s:
        raise ValueError(f"{name} is required")
    if len(s) > maxlen:
        raise ValueError(f"{name} is too long")
    return s


def normalize(raw: dict, preserve_password: str | None = None) -> dict:
    """Migrate old schemas, fill defaults, validate, and return canonical schema 3."""
    if not isinstance(raw, dict):
        raise ValueError("configuration must be a JSON object")
    c = deep_merge(defaults(), raw)
    c["schema"] = SCHEMA

    st = c["station"]
    st["callsign"] = _text(st.get("callsign"), "callsign", 12, False).upper()
    if not CALL_RE.fullmatch(st["callsign"]):
        raise ValueError("callsign format is invalid")
    st["base_dmr_id"] = _text(st.get("base_dmr_id"), "base DMR ID", 8, False)
    if not st["base_dmr_id"].isdigit() or not 5 <= len(st["base_dmr_id"]) <= 8:
        raise ValueError("base DMR ID must be 5-8 digits")
    essid = _text(st.get("essid", "01"), "ESSID", 2, True)
    if essid:
        if not essid.isdigit() or not 1 <= int(essid) <= 99:
            raise ValueError("ESSID must be blank or 01-99")
        essid = f"{int(essid):02d}"
    st["essid"] = essid
    expected_hid = int(st["base_dmr_id"]) if not essid else int(f"{st['base_dmr_id']}{int(essid):02d}")
    st["hotspot_id"] = expected_hid
    st["location"] = _text(st.get("location"), "location", 20)
    st["description"] = _text(st.get("description"), "description", 20)
    st["latitude"] = _float(st.get("latitude", 0), "latitude", -90, 90)
    st["longitude"] = _float(st.get("longitude", 0), "longitude", -180, 180)
    st["height"] = _int(st.get("height", 0), "antenna height", 0, 9999)
    st["url"] = _text(st.get("url"), "station URL", 124)

    r = c["radio"]
    r["frequency_hz"] = _int(r.get("frequency_hz"), "frequency", 1000000, 1300000000)
    r["color_code"] = _int(r.get("color_code", 1), "color code", 0, 15)
    r["rx_offset"] = _int(r.get("rx_offset", 0), "RX offset", -10000, 10000)
    r["tx_offset"] = _int(r.get("tx_offset", 0), "TX offset", -10000, 10000)
    r["tx_invert"] = _int(r.get("tx_invert", 1), "TX invert", 0, 1)
    r["rx_invert"] = _int(r.get("rx_invert", 0), "RX invert", 0, 1)
    r["rx_level"] = _int(r.get("rx_level", 50), "RX level", 0, 100)
    r["tx_level"] = _int(r.get("tx_level", 50), "TX level", 0, 100)
    r["rf_level"] = _int(r.get("rf_level", 100), "RF level", 0, 100)
    r["jitter_ms"] = _int(r.get("jitter_ms", r.get("jitter", 360)), "DMR jitter", 60, 3000)
    r["call_hang_s"] = _int(r.get("call_hang_s", 3), "DMR call hang", 0, 30)
    r["tx_hang_s"] = _int(r.get("tx_hang_s", 4), "DMR TX hang", 0, 30)
    r["timeout_s"] = _int(r.get("timeout_s", 180), "RF timeout", 30, 900)
    r["uart"] = _text(r.get("uart", "/dev/serial0"), "UART path", 64, False)
    r["uart_speed"] = _int(r.get("uart_speed", 115200), "UART speed", 1200, 4000000)

    bm = c["brandmeister"]
    bm["enabled"] = bool(bm.get("enabled", True))
    bm["master"] = _text(bm.get("master"), "BrandMeister master", 128, False)
    if not HOST_RE.fullmatch(bm["master"]):
        raise ValueError("BrandMeister master hostname is invalid")
    bm["port"] = _int(bm.get("port", 62031), "BrandMeister port", 1, 65535)
    pw = bm.get("password", "")
    if (pw is None or pw == "") and preserve_password is not None:
        pw = preserve_password
    pw = str(pw)
    if any(ch in pw for ch in ('"', "\n", "\r")):
        raise ValueError("Hotspot Security password contains an unsupported character")
    if len(pw) > 128:
        raise ValueError("Hotspot Security password is too long")
    bm["password"] = pw

    d = c["display"]
    d["enabled"] = bool(d.get("enabled", True))
    d["i2c_bus"] = _int(d.get("i2c_bus", 1), "OLED I2C bus", 0, 32)
    d["address"] = _text(d.get("address", "0x3c"), "OLED address", 8, False).lower()
    try:
        addr = int(d["address"], 0)
    except Exception:
        raise ValueError("OLED address must look like 0x3c")
    if not 0x03 <= addr <= 0x77:
        raise ValueError("OLED address is outside the normal I2C range")
    d["address"] = hex(addr)
    d["brightness"] = _int(d.get("brightness", 127), "OLED brightness", 1, 255)
    d["idle_timeout_s"] = _int(d.get("idle_timeout_s", 0), "OLED idle timeout", 0, 86400)

    w = c["web"]
    w["bind"] = _text(w.get("bind", "0.0.0.0"), "dashboard bind", 64, False)
    try:
        ipaddress.ip_address(w["bind"])
    except ValueError:
        raise ValueError("dashboard bind must be an IP address such as 0.0.0.0 or 127.0.0.1")
    w["port"] = _int(w.get("port", 8080), "dashboard port", 1024, 65535)

    m = c["maintenance"]
    m["rf_autostart"] = bool(m.get("rf_autostart", True))
    m["persistent_journal"] = bool(m.get("persistent_journal", True))
    m["journal_max_mb"] = _int(m.get("journal_max_mb", 100), "journal size", 16, 512)
    m["dmrid_update_days"] = _int(m.get("dmrid_update_days", 7), "DMR ID update interval", 1, 30)
    m["config_history_keep"] = _int(m.get("config_history_keep", 10), "config history retention", 3, 50)

    # Strict schema: drop unknown top-level and nested keys so browser input cannot
    # smuggle unvalidated data into the canonical appliance configuration.
    template = defaults()
    out = {"schema": SCHEMA}
    for sec in ("station", "radio", "brandmeister", "display", "web", "maintenance"):
        out[sec] = {k: c[sec][k] for k in template[sec]}
    return out


def public(c: dict) -> dict:
    out = copy.deepcopy(c)
    out.setdefault("brandmeister", {})["password"] = None
    out["brandmeister"]["password_configured"] = bool(c.get("brandmeister", {}).get("password"))
    return out


def hash_config(c: dict, include_secrets=True) -> str:
    obj = copy.deepcopy(c)
    if not include_secrets:
        obj.setdefault("brandmeister", {})["password"] = "***"
    blob = json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(blob).hexdigest()


def read(path: Path) -> dict:
    return normalize(json.loads(path.read_text()))


def diff_paths(a, b, prefix=""):
    changes = []
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b)):
            p = f"{prefix}.{k}" if prefix else k
            if k not in a or k not in b:
                changes.append(p)
            else:
                changes.extend(diff_paths(a[k], b[k], p))
    elif a != b:
        changes.append(prefix)
    return changes


def classify_changes(paths):
    """Return service/apply hints for changed config paths."""
    p = set(paths)
    rf = any(x.startswith(("station.", "radio.", "brandmeister.")) for x in p)
    oled = any(x.startswith("display.") for x in p)
    dashboard = any(x.startswith("web.") for x in p)
    journald = any(x in {"maintenance.persistent_journal", "maintenance.journal_max_mb"} for x in p)
    autostart = "maintenance.rf_autostart" in p
    return {
        "rf": rf,
        "oled": oled,
        "dashboard": dashboard,
        "journald": journald,
        "autostart": autostart,
        "changed": sorted(p),
    }
