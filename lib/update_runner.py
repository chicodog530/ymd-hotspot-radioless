#!/usr/bin/env python3
"""Root-owned detached updater used by the YWD-Hotspot WebUI.

The dashboard never executes git/update commands directly.  It asks the narrow
admin helper to start ywd-update.service; this runner then performs the existing
validated GitHub update independently of the dashboard process and publishes a
small sanitized status document for reconnect/polling.
"""
from __future__ import annotations

import grp
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

APP = Path("/opt/ywd-hotspot/app")
REPO = Path("/opt/ywd-hotspot/repo")
ETC = Path("/etc/ywd-hotspot")
VAR = Path("/var/lib/ywd-hotspot")
STATUS = VAR / "update-status.json"
BUILD = ETC / "build-info.json"
CHANNEL = ETC / "update-channel"
UPDATER = APP / "GITHUB-UPDATE.sh"
REPO_URLS = {
    "https://github.com/merberg-ai/ywd-hotspot.git",
    "https://github.com/merberg-ai/ywd-hotspot",
    "git@github.com:merberg-ai/ywd-hotspot.git",
}
ANSI_RE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_json(path, default):
    try:
        return json.loads(Path(path).read_text())
    except Exception:
        return default


def ywd_gid():
    try:
        return grp.getgrnam("ywd-hotspot").gr_gid
    except Exception:
        return 0


def write_status(**fields):
    VAR.mkdir(parents=True, exist_ok=True)
    old = read_json(STATUS, {})
    doc = old if isinstance(old, dict) else {}
    doc.update(fields)
    doc["updated_at"] = now_iso()
    tmp = STATUS.with_suffix(".tmp")
    tmp.write_text(json.dumps(doc, indent=2, sort_keys=True) + "\n")
    os.chmod(tmp, 0o640)
    try:
        os.chown(tmp, 0, ywd_gid())
    except Exception:
        pass
    os.replace(tmp, STATUS)
    return doc


def run(args, timeout=30, input_text=None):
    return subprocess.run(args, text=True, input=input_text, stdout=subprocess.PIPE,
                          stderr=subprocess.STDOUT, timeout=timeout, check=False)


def git(*args, timeout=20):
    p = run(["git", "-C", str(REPO), *args], timeout=timeout)
    if p.returncode != 0:
        raise RuntimeError((p.stdout or "git command failed").strip()[-800:])
    return (p.stdout or "").strip()


def channel_value():
    value = ""
    try:
        value = CHANNEL.read_text().strip()
    except Exception:
        pass
    if value not in {"main", "dev"}:
        value = str(read_json(BUILD, {}).get("update_channel") or "")
    if value not in {"main", "dev"}:
        raise RuntimeError("saved update channel must be main or dev")
    return value


def ensure_source():
    if not (REPO / ".git").is_dir():
        raise RuntimeError("GitHub-managed checkout is missing")
    origin = git("remote", "get-url", "origin")
    if origin not in REPO_URLS:
        raise RuntimeError(f"unexpected Git origin: {origin}")
    dirty = git("status", "--porcelain")
    if dirty:
        raise RuntimeError("managed Git checkout has local modifications")
    # Older OS images were cloned --single-branch dev-os.  Widen the refspec so
    # a saved main/dev application channel is always fetchable.
    p = run(["git", "-C", str(REPO), "config", "--replace-all", "remote.origin.fetch",
             "+refs/heads/*:refs/remotes/origin/*"], timeout=10)
    if p.returncode != 0:
        raise RuntimeError((p.stdout or "unable to repair Git fetch refspec").strip()[-800:])
    return origin


def clean(text):
    return ANSI_RE.sub("", text or "")


def parse_check(output):
    text = clean(output)
    data = {
        "installed_version": "unknown",
        "current_commit": str(read_json(BUILD, {}).get("commit") or "unknown"),
        "target_version": "unknown",
        "target_commit": "unknown",
        "target_date": "unknown",
        "channel": channel_value(),
        "available": "Status    : update available" in text,
        "up_to_date": "Status    : up to date" in text,
        "validated": "Candidate validation: OK" in text or "Status    : up to date" in text,
    }
    patterns = {
        "installed_version": r"^Installed\s*:\s*(.+)$",
        "target_version": r"^Target\s*:\s*(.+)$",
        "target_date": r"^Date\s*:\s*(.+)$",
    }
    for key, pat in patterns.items():
        m = re.search(pat, text, re.M)
        if m:
            data[key] = m.group(1).strip()
    m = re.search(r"^Source\s*:\s*(\S+)\s+@\s+([0-9a-fA-F]+)", text, re.M)
    if m:
        data["channel"] = m.group(1).strip()
        data["target_commit"] = m.group(2).strip()
    return data


def check_candidate(write=True):
    ensure_source()
    if not UPDATER.is_file():
        raise RuntimeError("GitHub updater is missing")
    p = run(["bash", str(UPDATER), "--dry-run"], timeout=180)
    info = parse_check(p.stdout)
    if p.returncode != 0:
        msg = clean(p.stdout).strip().splitlines()
        raise RuntimeError((msg[-1] if msg else "update candidate check failed")[:800])
    if not info["validated"]:
        raise RuntimeError("update candidate did not pass validation")
    if write:
        write_status(state="checked", phase="ready", error=None, started_at=None,
                     completed_at=None, **info)
    return info


def install_update():
    try:
        info = check_candidate(write=False)
        if info.get("up_to_date") or not info.get("available"):
            write_status(state="complete", phase="up-to-date", error=None,
                         completed_at=now_iso(), **info)
            return 0
        write_status(state="running", phase="installing", error=None,
                     started_at=now_iso(), completed_at=None, **info)
        # The existing updater has one explicit confirmation prompt.  Feeding a
        # single 'y' keeps all staging/validation/rollback logic in one canonical
        # updater instead of duplicating it here.
        p = run(["bash", str(UPDATER)], timeout=1200, input_text="y\n")
        text = clean(p.stdout)
        tail = "\n".join(text.strip().splitlines()[-24:])[-5000:]
        if p.returncode != 0:
            write_status(state="failed", phase="failed", error=(tail or "update failed")[-1200:],
                         completed_at=now_iso(), output_tail=tail, **info)
            return p.returncode or 1
        built = read_json(BUILD, {})
        backup = None
        m = re.findall(r"Backup retained:\s*(\S+)", text)
        if m:
            backup = m[-1]
        write_status(
            state="complete", phase="complete", error=None, completed_at=now_iso(),
            installed_version=built.get("version") or info.get("target_version"),
            current_commit=built.get("commit") or info.get("target_commit"),
            target_version=info.get("target_version"), target_commit=info.get("target_commit"),
            target_date=info.get("target_date"), channel=built.get("update_channel") or info.get("channel"),
            available=False, up_to_date=True, validated=True, backup=backup, output_tail=tail,
        )
        return 0
    except Exception as exc:
        write_status(state="failed", phase="failed", error=str(exc)[:1200], completed_at=now_iso())
        return 1


def main():
    if os.geteuid() != 0:
        raise SystemExit("ywd-update-runner must run as root")
    action = sys.argv[1] if len(sys.argv) > 1 else "install"
    if action == "check":
        try:
            print(json.dumps({"ok": True, **check_candidate(write=True)}, separators=(",", ":")))
        except Exception as exc:
            write_status(state="failed", phase="check-failed", error=str(exc)[:1200], completed_at=now_iso())
            print(json.dumps({"ok": False, "error": str(exc)[:800]}, separators=(",", ":")))
            raise SystemExit(1)
        return
    if action == "install":
        raise SystemExit(install_update())
    raise SystemExit("usage: ywd-update-runner [check|install]")


if __name__ == "__main__":
    main()
