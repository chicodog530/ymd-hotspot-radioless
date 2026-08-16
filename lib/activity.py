#!/usr/bin/env python3
"""Low-overhead live MMDVM activity collector.

One long-lived journalctl follower replaces the alpha2 dashboard's repeated
journalctl polling. State is written atomically for the dashboard/OLED.
"""
import json
import os
import re
import subprocess
import time
from pathlib import Path

RUN = Path(os.environ.get("YWD_ACTIVITY_STATE", "/run/ywd-hotspot/activity.json"))
HISTORY = Path(os.environ.get("YWD_ACTIVITY_HISTORY", "/var/lib/ywd-hotspot/lastheard.json"))
MAX_HISTORY = 60

START = re.compile(
    r"DMR Slot (?P<slot>\d+), received (?P<path>RF|network) (?:voice header|late entry) "
    r"from (?P<src>\S+) to (?P<group>TG )?(?P<dst>\S+)", re.I)
RF_END = re.compile(
    r"DMR Slot (?P<slot>\d+), (?:received RF end of voice transmission|RF voice transmission lost) "
    r"from (?P<src>\S+) to (?P<group>TG )?(?P<dst>\S+), (?P<secs>[\d.]+) seconds, "
    r"BER: (?P<ber>[\d.]+)%(?:, RSSI: (?P<rssi_min>-?\d+)/(?P<rssi_max>-?\d+)/(?P<rssi_avg>-?\d+) dBm)?", re.I)
NET_END = re.compile(
    r"DMR Slot (?P<slot>\d+), received network end of voice transmission "
    r"from (?P<src>\S+) to (?P<group>TG )?(?P<dst>\S+), (?P<secs>[\d.]+) seconds, "
    r"(?P<loss>\d+)% packet loss, BER: (?P<ber>[\d.]+)%", re.I)
NET_WATCH = re.compile(
    r"DMR Slot (?P<slot>\d+), network watchdog has expired(?:, (?P<secs>[\d.]+) seconds, "
    r"(?P<loss>\d+)% packet loss, BER: (?P<ber>[\d.]+)%)?", re.I)
RF_LOST_MARKER = re.compile(r"RF voice transmission lost", re.I)
MODEM_VERSION = re.compile(r"MMDVM protocol version: .*description: (?P<desc>.+)$", re.I)


def now():
    return time.time()


def blank_state():
    return {
        "updated_at": now(),
        "current": {"active": False, "direction": "idle"},
        "lastheard": [],
        "modem": {},
        "counters": {"rf_calls": 0, "net_calls": 0, "rf_lost": 0, "net_lost": 0},
    }


def load_history():
    try:
        d = json.loads(HISTORY.read_text())
        return d if isinstance(d, list) else []
    except Exception:
        return []


def atomic_json(path: Path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(obj, separators=(",", ":")) + "\n")
    os.replace(tmp, path)


def save(state, persist_history=False):
    state["updated_at"] = now()
    atomic_json(RUN, state)
    if persist_history:
        atomic_json(HISTORY, state["lastheard"][:MAX_HISTORY])


def make_party(token):
    token = token.strip().rstrip(",")
    if token.isdigit():
        return {"display": token, "dmr_id": int(token), "callsign": None}
    return {"display": token, "dmr_id": None, "callsign": token}


def start_event(state, m, raw):
    path = m.group("path").upper()
    direction = "rx" if path == "RF" else "tx"
    src = make_party(m.group("src"))
    dst_text = m.group("dst").rstrip(",")
    dst_id = int(dst_text) if dst_text.isdigit() else None
    event = {
        "started_at": now(),
        "ended_at": None,
        "active": True,
        "direction": direction,
        "path": path,
        "slot": int(m.group("slot")),
        "source": src,
        "destination": {"display": dst_text, "id": dst_id, "group": bool(m.group("group"))},
        "duration_s": None,
        "ber_pct": None,
        "packet_loss_pct": None,
        "rssi_dbm": None,
        "status": "active",
        "raw": raw[-300:],
    }
    state["current"] = event.copy()
    state["lastheard"].insert(0, event.copy())
    del state["lastheard"][MAX_HISTORY:]
    if path == "RF":
        state["counters"]["rf_calls"] += 1
    else:
        state["counters"]["net_calls"] += 1
    save(state, True)


def finish_event(state, path, m, raw, lost=False):
    cur = state.get("current", {})
    event = None
    # Prefer the newest matching history row; it survives dashboard/activity restarts.
    for item in state["lastheard"]:
        if item.get("active") and item.get("path") == path and item.get("slot") == int(m.group("slot")):
            event = item
            break
    if event is None:
        event = cur if cur.get("active") and cur.get("path") == path else None
    if event is None:
        return
    event["active"] = False
    event["ended_at"] = now()
    event["status"] = "lost" if lost else "complete"
    if m.groupdict().get("secs"):
        event["duration_s"] = float(m.group("secs"))
    if m.groupdict().get("ber"):
        event["ber_pct"] = float(m.group("ber"))
    if m.groupdict().get("loss"):
        event["packet_loss_pct"] = float(m.group("loss"))
    if m.groupdict().get("rssi_avg"):
        event["rssi_dbm"] = int(m.group("rssi_avg"))
        event["rssi_range_dbm"] = [int(m.group("rssi_min")), int(m.group("rssi_max"))]
    event["raw_end"] = raw[-300:]
    if lost:
        state["counters"]["rf_lost" if path == "RF" else "net_lost"] += 1
    # Update current with the completed event, but mark it inactive.
    state["current"] = event.copy()
    save(state, True)


def process_line(state, line):
    line = line.strip()
    if not line:
        return
    vm = MODEM_VERSION.search(line)
    if vm:
        state["modem"] = {"description": vm.group("desc")[:240], "seen_at": now()}
        save(state)
        return
    m = START.search(line)
    if m:
        start_event(state, m, line)
        return
    m = RF_END.search(line)
    if m:
        finish_event(state, "RF", m, line, lost=bool(RF_LOST_MARKER.search(line)))
        return
    m = NET_END.search(line)
    if m:
        finish_event(state, "NETWORK", m, line, lost=False)
        return
    m = NET_WATCH.search(line)
    if m:
        finish_event(state, "NETWORK", m, line, lost=True)
        return


def follow(state):
    cmd = ["journalctl", "-f", "-n", "0", "-u", "ywd-mmdvmhost.service", "--no-pager", "-o", "cat"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                         text=True, bufsize=1)
    assert p.stdout is not None
    for line in p.stdout:
        process_line(state, line)
    return p.wait()


def main():
    state = blank_state()
    state["lastheard"] = load_history()[:MAX_HISTORY]
    save(state)
    while True:
        try:
            follow(state)
        except Exception:
            pass
        time.sleep(2)

if __name__ == "__main__":
    main()
