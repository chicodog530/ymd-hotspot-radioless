#!/usr/bin/env python3
"""Small BrandMeister API v2 client used by YWD-Hotspot.

The API key is read server-side from /etc/ywd-hotspot/bm-api.key and is never
returned by the dashboard API.
"""
import argparse
import getpass
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

CFG = Path(os.environ.get("YWD_CONFIG", "/etc/ywd-hotspot/config.json"))
KEY = Path(os.environ.get("YWD_BM_API_KEY", "/etc/ywd-hotspot/bm-api.key"))
BASE = os.environ.get("YWD_BM_API_BASE", "https://api.brandmeister.network/v2").rstrip("/")
USER_AGENT = "YWD-Hotspot/0.1.0-alpha6"

class BMError(RuntimeError):
    pass

def read_config():
    return json.loads(CFG.read_text())

def hotspot_id():
    return int(read_config()["station"]["hotspot_id"])

def read_key():
    try:
        key = KEY.read_text().strip()
    except FileNotFoundError:
        raise BMError("BrandMeister API key is not configured")
    if not key:
        raise BMError("BrandMeister API key is empty")
    return key

def key_configured():
    try:
        return bool(KEY.read_text().strip())
    except Exception:
        return False

def _request(path, method="GET", payload=None, auth=False, timeout=4):
    url = f"{BASE}/{path.lstrip('/')}"
    data = None
    headers = {
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
    }
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if auth:
        headers["Authorization"] = f"Bearer {read_key()}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            if not raw:
                return {"ok": True, "status": r.status}
            ctype = r.headers.get("Content-Type", "")
            if "json" in ctype.lower():
                return json.loads(raw.decode("utf-8", "replace"))
            text = raw.decode("utf-8", "replace").strip()
            return {"ok": True, "status": r.status, "message": text[:500]}
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", "replace").strip()
        except Exception:
            body = ""
        raise BMError(f"BrandMeister API HTTP {e.code}: {body[:300] or e.reason}")
    except urllib.error.URLError as e:
        raise BMError(f"BrandMeister API connection failed: {e.reason}")
    except TimeoutError:
        raise BMError("BrandMeister API request timed out")

def profile(device_id=None):
    did = int(device_id or hotspot_id())
    return _request(f"device/{did}/profile", timeout=3)

def talkgroups():
    return _request("talkgroup", timeout=5)

def drop_qso(slot=0, device_id=None):
    did = int(device_id or hotspot_id())
    return _request(f"device/{did}/action/dropCallRoute/{int(slot)}", auth=True)

def drop_dynamic(slot=0, device_id=None):
    did = int(device_id or hotspot_id())
    return _request(f"device/{did}/action/dropDynamicGroups/{int(slot)}", auth=True)

def add_static(tg, slot=0, device_id=None):
    did = int(device_id or hotspot_id())
    return _request(f"device/{did}/talkgroup", method="POST",
                    payload={"slot": int(slot), "group": int(tg)}, auth=True)

def remove_static(tg, slot=0, device_id=None):
    did = int(device_id or hotspot_id())
    return _request(f"device/{did}/talkgroup/{int(slot)}/{int(tg)}",
                    method="DELETE", auth=True)

def install_key():
    if os.geteuid() != 0:
        raise SystemExit("Run with sudo/root.")
    print("Paste a BrandMeister API v2 key. Input is hidden.")
    key = getpass.getpass("API key: ").strip()
    if not key:
        raise SystemExit("No key supplied; unchanged.")
    KEY.parent.mkdir(parents=True, exist_ok=True)
    tmp = KEY.with_suffix(".tmp")
    tmp.write_text(key + "\n")
    os.chmod(tmp, 0o640)
    try:
        import grp
        gid = grp.getgrnam("ywd-hotspot").gr_gid
        os.chown(tmp, 0, gid)
    except Exception:
        pass
    os.replace(tmp, KEY)
    print(f"Stored {KEY} (root:ywd-hotspot, mode 0640).")

def remove_key():
    if os.geteuid() != 0:
        raise SystemExit("Run with sudo/root.")
    try:
        KEY.unlink()
        print("BrandMeister API key removed.")
    except FileNotFoundError:
        print("No BrandMeister API key was configured.")

def main():
    p = argparse.ArgumentParser(description="YWD-Hotspot BrandMeister API helper")
    sp = p.add_subparsers(dest="cmd", required=True)
    sp.add_parser("profile")
    sp.add_parser("dropqso").add_argument("slot", type=int, nargs="?", default=0)
    sp.add_parser("dropdyn").add_argument("slot", type=int, nargs="?", default=0)
    a = sp.add_parser("addtg"); a.add_argument("tg", type=int); a.add_argument("slot", type=int, nargs="?", default=0)
    d = sp.add_parser("deltg"); d.add_argument("tg", type=int); d.add_argument("slot", type=int, nargs="?", default=0)
    sp.add_parser("set-key")
    sp.add_parser("remove-key")
    sp.add_parser("key-status")
    args = p.parse_args()
    try:
        if args.cmd == "profile": out = profile()
        elif args.cmd == "dropqso": out = drop_qso(args.slot)
        elif args.cmd == "dropdyn": out = drop_dynamic(args.slot)
        elif args.cmd == "addtg": out = add_static(args.tg, args.slot)
        elif args.cmd == "deltg": out = remove_static(args.tg, args.slot)
        elif args.cmd == "set-key": install_key(); return
        elif args.cmd == "remove-key": remove_key(); return
        elif args.cmd == "key-status": print("configured" if key_configured() else "not configured"); return
        else: return
        print(json.dumps(out, indent=2, sort_keys=True))
    except (BMError, ValueError, KeyError, json.JSONDecodeError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        raise SystemExit(1)

if __name__ == "__main__":
    main()
