#!/usr/bin/env python3
"""Tiny SSD1306 status display for YWD-Hotspot.

Alpha5 reads the activity collector's state file for live RX/TX instead of
spawning several helper commands every few seconds.
"""
import json
import subprocess
import time
from pathlib import Path

try:
    import smbus
except ImportError:
    raise SystemExit("python3-smbus is required")

CFG = Path("/etc/ywd-hotspot/config.json")
ACTIVITY = Path("/run/ywd-hotspot/activity.json")

FONT = {
' ':[0,0,0,0,0],'-':[8,8,8,8,8],'.':[0,96,96,0,0],'/':[32,16,8,4,2],':':[0,54,54,0,0],
'0':[62,81,73,69,62],'1':[0,66,127,64,0],'2':[66,97,81,73,70,],'3':[33,65,69,75,49],'4':[24,20,18,127,16],
'5':[39,69,69,69,57],'6':[60,74,73,73,48],'7':[1,113,9,5,3],'8':[54,73,73,73,54],'9':[6,73,73,41,30],
'A':[126,17,17,17,126],'B':[127,73,73,73,54],'C':[62,65,65,65,34],'D':[127,65,65,34,28],'E':[127,73,73,73,65],
'F':[127,9,9,9,1],'G':[62,65,73,73,122],'H':[127,8,8,8,127],'I':[0,65,127,65,0],'J':[32,64,65,63,1],
'K':[127,8,20,34,65],'L':[127,64,64,64,64],'M':[127,2,12,2,127],'N':[127,4,8,16,127],'O':[62,65,65,65,62],
'P':[127,9,9,9,6],'Q':[62,65,81,33,94],'R':[127,9,25,41,70],'S':[70,73,73,73,49],'T':[1,1,127,1,1],
'U':[63,64,64,64,63],'V':[31,32,64,32,31],'W':[63,64,56,64,63],'X':[99,20,8,20,99],'Y':[7,8,112,8,7],
'Z':[97,81,73,69,67],'_':[64,64,64,64,64]
}

def sh(args, timeout=1):
    try:
        return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL, timeout=timeout).strip()
    except Exception:
        return ""

def service_states():
    out = sh(["systemctl", "is-active", "ywd-mmdvmhost.service", "ywd-dmrgateway.service"], 2).splitlines()
    return (out[0] if len(out)>0 else "unknown", out[1] if len(out)>1 else "unknown")

def ip_addr():
    s = sh(["hostname", "-I"])
    return s.split()[0] if s else "NO IP"

def temp():
    try:
        return f"{int(Path('/sys/class/thermal/thermal_zone0/temp').read_text())/1000:.0f}C"
    except Exception:
        return "--C"

def activity():
    try:
        d = json.loads(ACTIVITY.read_text())
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}

class OLED:
    def __init__(self, bus=1, addr=0x3c, brightness=127):
        self.bus = smbus.SMBus(bus)
        self.addr = addr
        self.last = [None] * 8
        self.on = True
        brightness = max(1, min(255, int(brightness)))
        self.cmds([0xAE,0x20,0x00,0xB0,0xC8,0x00,0x10,0x40,0x81,brightness,0xA1,0xA6,
                   0xA8,0x3F,0xA4,0xD3,0x00,0xD5,0x80,0xD9,0xF1,0xDA,0x12,0xDB,0x40,
                   0x8D,0x14,0xAF])
        self.clear()

    def cmd(self, c):
        self.bus.write_byte_data(self.addr, 0x00, c)

    def cmds(self, values):
        for c in values:
            self.cmd(c)

    def power(self, on):
        on = bool(on)
        if self.on == on:
            return
        self.cmd(0xAF if on else 0xAE)
        self.on = on

    def clear(self):
        for page in range(8):
            self._write(page, "")
            self.last[page] = ""

    def _write(self, page, text):
        text = str(text).upper()[:21]
        data = []
        for ch in text:
            data += FONT.get(ch, FONT[' ']) + [0]
        data = (data + [0]*128)[:128]
        self.cmd(0xB0 + page); self.cmd(0x00); self.cmd(0x10)
        for x in range(0, 128, 16):
            self.bus.write_i2c_block_data(self.addr, 0x40, data[x:x+16])

    def line(self, page, text):
        text = str(text).upper()[:21]
        if self.last[page] == text:
            return
        self._write(page, text)
        self.last[page] = text

def display_party(p):
    p = p or {}
    return str(p.get("callsign") or p.get("display") or "UNKNOWN")[:21]

def main():
    c = json.loads(CFG.read_text())
    d = c.get("display", {})
    if not d.get("enabled", True):
        return
    o = OLED(int(d.get("i2c_bus",1)), int(str(d.get("address","0x3c")),0), int(d.get("brightness",127)))
    idle_timeout = max(0, int(d.get("idle_timeout_s",0)))
    last_activity = time.monotonic()
    st, rf = c.get("station", {}), c.get("radio", {})
    call = st.get("callsign","NOCALL")
    mhz = rf.get("frequency_hz",0) / 1e6
    cc = rf.get("color_code",1)
    mmdvm = gateway = "unknown"
    ip = "NO IP"
    next_services = next_ip = 0.0

    while True:
        try:
            n = time.monotonic()
            if n >= next_services:
                mmdvm, gateway = service_states()
                next_services = n + 15
            if n >= next_ip:
                ip = ip_addr()
                next_ip = n + 30

            a = activity(); cur = a.get("current") or {}
            if cur.get("active"):
                last_activity = n
                o.power(True)
            elif idle_timeout and n - last_activity >= idle_timeout:
                o.power(False)
            else:
                o.power(True)
            if not o.on:
                time.sleep(1)
                continue
            o.line(0, f"YWD HOTSPOT {call}")
            if cur.get("active"):
                rx = cur.get("direction") == "rx"
                dst = cur.get("destination") or {}
                o.line(2, "RX FROM RADIO" if rx else "TX TO RADIO")
                o.line(3, display_party(cur.get("source")))
                o.line(4, f"{'TG' if dst.get('group') else 'PC'} {dst.get('display','?')}")
                elapsed = max(0, int(time.time() - float(cur.get("started_at", time.time()))))
                o.line(5, f"SLOT {cur.get('slot','?')}  {elapsed}S")
            else:
                o.line(2, f"DMR {mhz:.4f} CC{cc}")
                o.line(3, "")
                o.line(4, "MMDVM UP" if mmdvm == "active" else "MMDVM DOWN")
                o.line(5, "BM LINK UP" if gateway == "active" else "BM LINK DOWN")
            o.line(6, "")
            o.line(7, f"{ip} {temp()}")
        except OSError:
            pass
        except Exception:
            pass
        time.sleep(1)

if __name__ == "__main__":
    main()
