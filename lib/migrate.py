#!/usr/bin/env python3
"""Migrate existing canonical config to the current schema without changing secrets."""
import json, os
from pathlib import Path
import config_model
CFG=Path(os.environ.get("YWD_CONFIG","/etc/ywd-hotspot/config.json"))

def main():
    if os.geteuid()!=0: raise SystemExit("root required")
    raw=json.loads(CFG.read_text()); new=config_model.normalize(raw)
    tmp=CFG.with_suffix(".migrate.tmp"); tmp.write_text(json.dumps(new,indent=2)+"\n"); os.chmod(tmp,0o640)
    try:
        import grp; os.chown(tmp,0,grp.getgrnam("ywd-hotspot").gr_gid)
    except Exception: pass
    os.replace(tmp,CFG); print(f"Migrated {CFG} to schema {config_model.SCHEMA}")
if __name__=="__main__": main()
