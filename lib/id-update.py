#!/usr/bin/env python3
"""Update the lightweight MMDVM DMR ID lookup file from RadioID.net."""
import csv
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

URL = os.environ.get("YWD_DMRID_URL", "https://database.radioid.net/static/user.csv")
OUT = Path(os.environ.get("YWD_DMRID_FILE", "/var/lib/ywd-hotspot/DMRIds.dat"))
CFG = Path(os.environ.get("YWD_CONFIG", "/etc/ywd-hotspot/config.json"))
UA = "YWD-Hotspot/0.1.0-alpha5"


def interval_days():
    try:
        c=json.loads(CFG.read_text()); return max(1, min(30, int(c.get("maintenance",{}).get("dmrid_update_days",7))))
    except Exception:
        return 7


def due():
    try: age=time.time()-OUT.stat().st_mtime
    except FileNotFoundError: return True
    return age >= interval_days()*86400


def main():
    if os.geteuid() != 0:
        raise SystemExit("Run with sudo/root.")
    force = "--force" in sys.argv[1:]
    if not force and not due():
        print(f"DMR ID database is not due yet (configured every {interval_days()} days).")
        return
    req = urllib.request.Request(URL, headers={"User-Agent": UA, "Accept": "text/csv,*/*"})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            raw = r.read()
    except (urllib.error.URLError, TimeoutError) as e:
        raise SystemExit(f"DMR ID update failed: {e}")
    text = raw.decode("utf-8-sig", "replace")
    rows = []
    for row in csv.reader(io.StringIO(text)):
        if len(row) < 2: continue
        rid = row[0].strip(); call = row[1].strip().upper()
        if not rid.isdigit() or not call: continue
        rows.append(f"{rid}\t{call}")
    if len(rows) < 1000:
        raise SystemExit(f"DMR ID update rejected: only {len(rows)} valid rows")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix(".tmp")
    tmp.write_text("\n".join(rows) + "\n")
    os.chmod(tmp, 0o640)
    try:
        import grp
        os.chown(tmp, 0, grp.getgrnam("ywd-hotspot").gr_gid)
    except Exception: pass
    os.replace(tmp, OUT)
    print(f"Updated {OUT}: {len(rows)} DMR IDs")

if __name__ == "__main__": main()
