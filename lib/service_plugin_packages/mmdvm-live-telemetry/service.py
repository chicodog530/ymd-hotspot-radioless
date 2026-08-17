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


def stop(_signum, _frame): STOP.set()


def main():
    signal.signal(signal.SIGTERM, stop); signal.signal(signal.SIGINT, stop)
    interval, stale = config()
    print(f'YWD mmdvm-live-telemetry adapter starting: interval={interval}s stale={stale}s', flush=True)
    while not STOP.is_set():
        raw = snapshot(); bridge = raw.get('bridge') if isinstance(raw.get('bridge'), dict) else {}
        rssi = raw.get('rssi') if isinstance(raw.get('rssi'), dict) else {}
        ber = raw.get('ber') if isinstance(raw.get('ber'), dict) else {}
        dmr = raw.get('dmr') if isinstance(raw.get('dmr'), dict) else {}
        active = dmr.get('active') if isinstance(dmr.get('active'), dict) else {}
        call = ''
        if active:
            dst = active.get('dst_id'); prefix = 'TG ' if str(active.get('group','')).lower() == 'yes' else ''
            call = f" src={active.get('src_info') or active.get('src_id')} dst={prefix}{dst} slot={active.get('slot')} source={active.get('source')}"
        print(f"YWD telemetry: bridge={bridge.get('status','offline')} messages={bridge.get('messages',0)} RSSI={rssi.get('value','—')} BER={ber.get('value','—')}{call}", flush=True)
        STOP.wait(interval)
    print('YWD mmdvm-live-telemetry adapter stopping cleanly', flush=True)


if __name__ == '__main__': main()
