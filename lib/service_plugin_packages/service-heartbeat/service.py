#!/usr/bin/env python3
from __future__ import annotations

import json
import signal
import threading
from pathlib import Path

CONFIG = Path('/etc/ywd-hotspot/plugins/service-heartbeat.json')
STOP = threading.Event()


def config():
    try:
        raw = json.loads(CONFIG.read_text(encoding='utf-8'))
        if not isinstance(raw, dict):
            raw = {}
    except Exception:
        raw = {}
    label = str(raw.get('label') or 'YWD service plugin alive')[:80]
    try:
        interval = int(raw.get('interval_s', 60))
    except Exception:
        interval = 60
    interval = max(10, min(300, interval))
    return label, interval


def stop(_signum, _frame):
    STOP.set()


def main():
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    label, interval = config()
    print(f'YWD service-heartbeat starting: label={label!r} interval={interval}s', flush=True)
    while not STOP.is_set():
        print(f'YWD service-heartbeat: {label}', flush=True)
        STOP.wait(interval)
    print('YWD service-heartbeat stopping cleanly', flush=True)


if __name__ == '__main__':
    main()
