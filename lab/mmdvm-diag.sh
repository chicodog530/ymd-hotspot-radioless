#!/usr/bin/env bash
set -u

VERSION="1.0"
BACKUP_ROOT="/var/backups/mmdvm-diag"

if [[ -f /boot/firmware/config.txt ]]; then CONFIG_FILE=/boot/firmware/config.txt
elif [[ -f /boot/config.txt ]]; then CONFIG_FILE=/boot/config.txt
else CONFIG_FILE=""; fi

if [[ -f /boot/firmware/cmdline.txt ]]; then CMDLINE_FILE=/boot/firmware/cmdline.txt
elif [[ -f /boot/cmdline.txt ]]; then CMDLINE_FILE=/boot/cmdline.txt
else CMDLINE_FILE=""; fi

MODEL="$(tr -d '\0' </proc/device-tree/model 2>/dev/null || echo Unknown)"

pause(){ echo; read -r -p "Press Enter to continue..." _; }
header(){ clear 2>/dev/null || true; printf '%s\n' "============================================================" " MMDVM Hardware Diagnostic Utility v$VERSION" "============================================================" " Host   : $MODEL" " Config : ${CONFIG_FILE:-NOT FOUND}" " Cmdline: ${CMDLINE_FILE:-NOT FOUND}" "============================================================"; }
need_root(){ if [[ $EUID -ne 0 ]]; then exec sudo "$0" "$@"; fi; }

serial_devices(){
  echo "=== SERIAL DEVICES ==="
  ls -l /dev/serial* /dev/ttyAMA* /dev/ttyS* 2>/dev/null || echo "No serial devices found."
  echo
}

gpio_status(){
  echo "=== UART / I2C GPIO ==="
  if command -v pinctrl >/dev/null 2>&1; then
    for p in 2 3 14 15; do pinctrl get "$p" 2>&1 || true; done
  elif command -v raspi-gpio >/dev/null 2>&1; then
    raspi-gpio get 2 3 14 15 2>&1 || true
  else
    echo "Neither pinctrl nor raspi-gpio is installed."
  fi
  echo
}

i2c_status(){
  echo "=== I2C BUSES ==="
  ls -l /dev/i2c* 2>/dev/null || echo "No /dev/i2c-* devices found."
  echo
  echo "=== I2C BUS 1 SCAN ==="
  if [[ ! -e /dev/i2c-1 ]]; then
    echo "/dev/i2c-1 is not present."
  elif command -v i2cdetect >/dev/null 2>&1; then
    scan="$(i2cdetect -y 1 2>&1 || true)"
    echo "$scan"
    echo
    grep -Eq '(^|[[:space:]])3c([[:space:]]|$)' <<<"$scan" && echo "OLED candidate detected at 0x3C."
    grep -Eq '(^|[[:space:]])3d([[:space:]]|$)' <<<"$scan" && echo "OLED candidate detected at 0x3D."
  else
    echo "i2cdetect is not installed. Install: sudo apt install i2c-tools"
  fi
  echo
}

boot_config_status(){
  echo "=== BOOT UART CONFIGURATION ==="
  if [[ -n "$CONFIG_FILE" ]]; then
    echo "File: $CONFIG_FILE"
    grep -nE '^[[:space:]]*(enable_uart|dtoverlay=.*(bt|uart))' "$CONFIG_FILE" 2>/dev/null || echo "(no active UART/Bluetooth overlay lines)"
  else echo "config.txt not found."; fi
  echo
  echo "=== KERNEL COMMAND LINE ==="
  if [[ -n "$CMDLINE_FILE" ]]; then
    cat "$CMDLINE_FILE"; echo
    if grep -Eq '(^|[[:space:]])console=(serial0|ttyAMA[0-9]*|ttyS[0-9]*),' "$CMDLINE_FILE"; then
      echo "WARNING: a UART serial console is configured."
    else echo "No serial UART console token detected."; fi
  else echo "cmdline.txt not found."; fi
  echo
  echo "=== HCIUART SERVICE ==="
  systemctl is-enabled hciuart 2>/dev/null || true
  systemctl is-active hciuart 2>/dev/null || true
  echo
  echo "=== LOADED DEVICE-TREE OVERLAYS ==="
  if command -v dtoverlay >/dev/null 2>&1; then dtoverlay -l 2>&1 || true; else echo "dtoverlay command not found."; fi
  echo
}

mmdvm_probe(){
  echo "=== MMDVM READ-ONLY VERSION PROBE ==="
  python3 - <<'PY'
import os, termios, time
candidates=["/dev/serial0","/dev/ttyAMA0","/dev/ttyS0"]
seen=set()
devices=[]
for dev in candidates:
    if not os.path.exists(dev): continue
    real=os.path.realpath(dev)
    if real in seen: continue
    seen.add(real); devices.append((dev,real))
if not devices:
    print("No candidate UART device found.")
    raise SystemExit
request=bytes([0xE0,0x03,0x00])
for shown,real in devices:
    print(f"Trying {shown} -> {real} at 115200...")
    try: fd=os.open(shown,os.O_RDWR|os.O_NOCTTY)
    except Exception as e:
        print("  Open failed:",e); continue
    try:
        a=termios.tcgetattr(fd)
        a[0]=0; a[1]=0
        a[2]=termios.CLOCAL|termios.CREAD|termios.CS8
        a[3]=0; a[4]=termios.B115200; a[5]=termios.B115200
        a[6][termios.VMIN]=0; a[6][termios.VTIME]=10
        termios.tcsetattr(fd,termios.TCSANOW,a)
        termios.tcflush(fd,termios.TCIOFLUSH)
        os.write(fd,request); time.sleep(.25)
        data=b""; end=time.time()+1.25
        while time.time()<end and len(data)<256:
            chunk=os.read(fd,256-len(data))
            if chunk:
                data+=chunk
                if len(data)>=2 and data[0]==0xE0 and len(data)>=data[1]: break
            else: time.sleep(.05)
        if not data:
            print("  No response."); continue
        print(f"  Received {len(data)} bytes")
        print("  HEX  :",data.hex(" "))
        printable="".join(chr(b) if 32<=b<=126 else "." for b in data)
        print("  ASCII:",printable)
        if b"MMDVM" in data:
            t=" ".join(data.decode("ascii","ignore").replace("\x00"," ").split())
            pos=t.find("MMDVM")
            print("  MODEM:",t[pos:])
    except Exception as e: print("  Probe error:",e)
    finally: os.close(fd)
print()
PY
}

system_status(){
  echo "=== SYSTEM ==="
  echo "Date   : $(date -Is 2>/dev/null || date)"
  echo "Model  : $MODEL"
  echo "Kernel : $(uname -a)"
  if [[ -r /etc/os-release ]]; then . /etc/os-release; echo "OS     : ${PRETTY_NAME:-unknown}"; fi
  echo
  if command -v vcgencmd >/dev/null 2>&1; then
    echo "=== PI POWER / THERMAL ==="
    vcgencmd measure_temp 2>/dev/null || true
    vcgencmd get_throttled 2>/dev/null || true
    echo
  fi
}

kernel_status(){
  echo "=== RECENT UART / I2C KERNEL MESSAGES ==="
  dmesg 2>/dev/null | grep -Ei 'tty|serial|uart|i2c' | tail -80 || true
  echo
}

run_full_diag(){
  header
  echo "Running full diagnostics. This does NOT change configuration."; echo
  LOG="$HOME/mmdvm-diag-$(date +%Y%m%d-%H%M%S).txt"
  { system_status; serial_devices; gpio_status; i2c_status; boot_config_status; mmdvm_probe; kernel_status; } | tee "$LOG"
  echo; echo "Report saved to: $LOG"; pause
}

backup_boot_files(){
  stamp="$(date +%Y%m%d-%H%M%S)"; dir="$BACKUP_ROOT/$stamp"; mkdir -p "$dir"
  if [[ -n "$CONFIG_FILE" ]]; then cp -a "$CONFIG_FILE" "$dir/config.txt"; printf '%s\n' "$CONFIG_FILE" >"$dir/config.path"; fi
  if [[ -n "$CMDLINE_FILE" ]]; then cp -a "$CMDLINE_FILE" "$dir/cmdline.txt"; printf '%s\n' "$CMDLINE_FILE" >"$dir/cmdline.path"; fi
  systemctl is-enabled hciuart >"$dir/hciuart.enabled" 2>/dev/null || true
  echo "$dir"
}

set_config_key(){
  key="$1"; value="$2"; file="$3"
  if grep -Eq "^[[:space:]]*${key}=" "$file"; then
    sed -i -E "s|^[[:space:]]*${key}=.*|${key}=${value}|" "$file"
  else printf '\n%s=%s\n' "$key" "$value" >>"$file"; fi
}

enable_disable_bt_overlay(){
  file="$1"
  sed -i -E 's|^[[:space:]]*dtoverlay=pi3-disable-bt([[:space:]]*)$|dtoverlay=disable-bt|' "$file"
  grep -Eq '^[[:space:]]*dtoverlay=disable-bt([,[:space:]]|$)' "$file" || printf 'dtoverlay=disable-bt\n' >>"$file"
}

remove_serial_console(){
  file="$1"; [[ -z "$file" ]] && return 0
  sed -i -E     -e 's/(^|[[:space:]])console=(serial0|ttyAMA[0-9]*|ttyS[0-9]*),[^[:space:]]+//g'     -e 's/[[:space:]]+/ /g' -e 's/^[[:space:]]+//' -e 's/[[:space:]]+$//' "$file"
}

apply_uart_config(){
  need_root
  header
  cat <<'EOF'
This prepares GPIO14/15 for the full PL011 UART used by MMDVM_HS
boards on a Raspberry Pi Zero W.

It will:
  * back up config.txt and cmdline.txt
  * set enable_uart=1
  * add dtoverlay=disable-bt
  * remove UART serial-console tokens from cmdline.txt, if present
  * disable the hciuart service

Bluetooth will be disabled after reboot. Wi-Fi is NOT affected.
EOF
  echo
  if [[ "$MODEL" != *"Zero"* ]]; then
    echo "WARNING: host does not identify as a Raspberry Pi Zero: $MODEL"; echo
  fi
  if [[ -z "$CONFIG_FILE" || ! -f "$CONFIG_FILE" ]]; then echo "ERROR: config.txt not found."; pause; return; fi
  read -r -p "Apply these changes? Type YES to continue: " ans
  [[ "$ans" == "YES" ]] || { echo "Cancelled. Nothing changed."; pause; return; }

  backup="$(backup_boot_files)"
  echo "Backup created: $backup"
  set_config_key enable_uart 1 "$CONFIG_FILE"
  enable_disable_bt_overlay "$CONFIG_FILE"
  [[ -n "$CMDLINE_FILE" ]] && remove_serial_console "$CMDLINE_FILE"
  systemctl disable hciuart >/dev/null 2>&1 || true
  sync

  echo; echo "Applied. Relevant config:"
  grep -nE '^[[:space:]]*(enable_uart|dtoverlay=.*bt)' "$CONFIG_FILE" || true
  echo; echo "Reboot required. On a Zero W, /dev/serial0 should normally become ttyAMA0."
  read -r -p "Reboot now? [y/N]: " ans
  [[ "$ans" =~ ^[Yy]$ ]] && reboot
  pause
}

latest_backup(){ find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort | tail -1; }

restore_latest_backup(){
  need_root; header
  dir="$(latest_backup)"
  if [[ -z "$dir" || ! -d "$dir" ]]; then echo "No backup under $BACKUP_ROOT"; pause; return; fi
  echo "Latest backup: $dir"; echo
  read -r -p "Restore it? Type RESTORE to continue: " ans
  [[ "$ans" == "RESTORE" ]] || { echo "Cancelled."; pause; return; }

  if [[ -f "$dir/config.txt" && -f "$dir/config.path" ]]; then target="$(cat "$dir/config.path")"; cp -a "$dir/config.txt" "$target"; echo "Restored $target"; fi
  if [[ -f "$dir/cmdline.txt" && -f "$dir/cmdline.path" ]]; then target="$(cat "$dir/cmdline.path")"; cp -a "$dir/cmdline.txt" "$target"; echo "Restored $target"; fi
  if [[ -f "$dir/hciuart.enabled" ]] && grep -qx enabled "$dir/hciuart.enabled"; then systemctl enable hciuart >/dev/null 2>&1 || true; echo "Restored hciuart enabled state."; fi
  sync; echo; echo "Restore complete. Reboot to apply."; pause
}

probe_only(){ header; mmdvm_probe; pause; }
i2c_only(){ header; i2c_status; pause; }
show_uart_only(){ header; serial_devices; gpio_status; boot_config_status; pause; }
reboot_menu(){ header; read -r -p "Reboot now? [y/N]: " ans; [[ "$ans" =~ ^[Yy]$ ]] && sudo reboot; }

while true; do
  header
  cat <<'EOF'

  1) Run full hardware diagnostics
  2) Probe MMDVM modem firmware only
  3) Scan I2C / OLED
  4) Show UART, GPIO and boot configuration
  5) Apply recommended Pi Zero W PL011 UART configuration
  6) Restore latest UART configuration backup
  7) Reboot
  0) Exit

EOF
  read -r -p "Select an option: " choice
  case "$choice" in
    1) run_full_diag ;;
    2) probe_only ;;
    3) i2c_only ;;
    4) show_uart_only ;;
    5) apply_uart_config ;;
    6) restore_latest_backup ;;
    7) reboot_menu ;;
    0|q|Q) echo "Bye."; exit 0 ;;
    *) echo "Invalid selection."; sleep 1 ;;
  esac
done
