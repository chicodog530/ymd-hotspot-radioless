#!/usr/bin/env python3
from __future__ import annotations

import json
import signal
import threading
from pathlib import Path

CONFIG = Path('/etc/ywd-hotspot/plugins/mmdvm-live-telemetry.json')
SNAPSHOT = Path('/run/ywd-hotspot-telemetry/telemetry.json')
STOP = threading.Event()


def config():
    try:
        raw = json.loads(CONFIG.read_text(encoding='utf-8'))
        if not isinstance(raw, dict): raw = {}
    except Exception:
        raw = {}
    try: interval = int(raw.get('log_interval_s', 15))
    except Exception: interval = 15
    try: stale = int(raw.get('stale_after_s', 8))
    except Exception: stale = 8
    return max(5, min(300, interval)), max(3, min(60, stale))


def snapshot():
    try:
        raw = json.loads(SNAPSHOT.read_text(encoding='utf-8'))
        return raw if isinstance(raw, dict) else {}
    except Exception:
        return {}


def session_text(session):
    if not isinstance(session, dict):
        return ''
    src = session.get('src_info') or session.get('src_id') or 'unknown'
    dst = session.get('dst_id')
    prefix = 'TG ' if session.get('group') is True else ''
    return f" id={session.get('session_id')} src={src} dst={prefix}{dst} slot={session.get('slot')} direction={session.get('direction')} state={session.get('state')}"


def stop(_signum, _frame): STOP.set()


def main():
    signal.signal(signal.SIGTERM, stop); signal.signal(signal.SIGINT, stop)
    interval, stale = config()
    print(f'YWD mmdvm-live-telemetry adapter starting: interval={interval}s stale={stale}s', flush=True)
    while not STOP.is_set():
        raw = snapshot(); bridge = raw.get('bridge') if isinstance(raw.get('bridge'), dict) else {}
        rssi = raw.get('rssi') if isinstance(raw.get('rssi'), dict) else {}
        ber = raw.get('ber') if isinstance(raw.get('ber'), dict) else {}
        sessions = raw.get('sessions') if isinstance(raw.get('sessions'), dict) else {}
        active_list = sessions.get('active') if isinstance(sessions.get('active'), list) else []
        active = active_list[0] if active_list and isinstance(active_list[0], dict) else None
        last = sessions.get('last') if isinstance(sessions.get('last'), dict) else None
        detail = session_text(active)
        if not detail and last:
            detail = ' last' + session_text(last)
        print(f"YWD telemetry: bridge={bridge.get('status','offline')} messages={bridge.get('messages',0)} RSSI={rssi.get('value','—')} BER={ber.get('value','—')}{detail}", flush=True)
        STOP.wait(interval)
    print('YWD mmdvm-live-telemetry adapter stopping cleanly', flush=True)


if __name__ == '__main__': main()
