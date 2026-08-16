#!/usr/bin/env python3
"""Configure/verify the LAN dashboard control password."""
import base64
import getpass
import hashlib
import hmac
import json
import os
import sys
from pathlib import Path

AUTH = Path(os.environ.get("YWD_WEB_AUTH", "/etc/ywd-hotspot/web-auth.json"))
N = 1 << 14
R = 8
P = 1
DKLEN = 32

def configured():
    return AUTH.is_file()

def _derive(password: str, salt: bytes, n=N, r=R, p=P):
    return hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p, dklen=DKLEN)

def verify(password: str) -> bool:
    try:
        d = json.loads(AUTH.read_text())
        salt = base64.b64decode(d["salt"])
        expected = base64.b64decode(d["hash"])
        actual = _derive(password, salt, int(d.get("n", N)), int(d.get("r", R)), int(d.get("p", P)))
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False

def set_password_value(password: str):
    """Store a supplied control password. Caller must already be privileged/authenticated."""
    if os.geteuid() != 0:
        raise PermissionError("root required")
    if len(password) < 8:
        raise ValueError("Use at least 8 characters")
    salt = os.urandom(16)
    digest = _derive(password, salt)
    doc = {
        "scheme": "scrypt",
        "n": N,
        "r": R,
        "p": P,
        "salt": base64.b64encode(salt).decode("ascii"),
        "hash": base64.b64encode(digest).decode("ascii"),
    }
    AUTH.parent.mkdir(parents=True, exist_ok=True)
    tmp = AUTH.with_suffix(".tmp")
    tmp.write_text(json.dumps(doc, indent=2) + "\n")
    os.chmod(tmp, 0o640)
    try:
        import grp
        os.chown(tmp, 0, grp.getgrnam("ywd-hotspot").gr_gid)
    except Exception:
        pass
    os.replace(tmp, AUTH)


def set_password():
    if os.geteuid() != 0:
        raise SystemExit("Run with sudo/root.")
    print("Set a password for WRITE controls on the YWD-Hotspot LAN dashboard.")
    print("Status pages remain readable without a login.")
    while True:
        p1 = getpass.getpass("Control password: ")
        if len(p1) < 8:
            print("Use at least 8 characters.")
            continue
        p2 = getpass.getpass("Confirm password: ")
        if p1 != p2:
            print("Passwords do not match.")
            continue
        break
    set_password_value(p1)
    print(f"Stored dashboard control credential in {AUTH}.")

def remove_password():
    if os.geteuid() != 0:
        raise SystemExit("Run with sudo/root.")
    try:
        AUTH.unlink()
        print("Dashboard WRITE controls locked/disabled.")
    except FileNotFoundError:
        print("Dashboard WRITE controls were already disabled.")

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "set": set_password()
    elif cmd == "remove": remove_password()
    elif cmd == "status": print("configured" if configured() else "not configured")
    else: raise SystemExit("Usage: web-auth.py {set|remove|status}")

if __name__ == "__main__":
    main()
