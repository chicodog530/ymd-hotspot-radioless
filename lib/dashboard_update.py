#!/usr/bin/env python3
"""Software-update extension for the YWD-Hotspot dashboard handler."""
from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse

import dashboard_core as core

STATUS = core.VAR / "update-status.json"
PUBLIC_KEYS = {
    "state", "phase", "installed_version", "current_commit", "target_version",
    "target_commit", "target_date", "channel", "available", "up_to_date",
    "validated", "started_at", "completed_at", "updated_at", "backup", "error",
}


def public_status():
    try:
        doc = json.loads(STATUS.read_text())
    except Exception:
        doc = {"state": "idle", "phase": "idle"}
    if not isinstance(doc, dict):
        doc = {"state": "idle", "phase": "idle"}
    out = {k: doc.get(k) for k in PUBLIC_KEYS if k in doc}
    out.setdefault("state", "idle")
    out.setdefault("phase", "idle")
    if out.get("error"):
        out["error"] = str(out["error"])[-1200:]
    return out


def wrap_handler(base):
    class UpdateHandler(base):
        def do_GET(self):
            path = urlparse(self.path).path
            if path == "/update.js":
                self.serve_static("update.js", "application/javascript; charset=utf-8")
                return
            if path == "/update.css":
                self.serve_static("update.css", "text/css; charset=utf-8")
                return
            if path == "/api/update/status":
                # Deliberately public and sanitized: a successful update restarts
                # the dashboard, which destroys the in-memory control session.
                # The browser still needs to report completion/reconnect state.
                self.send_json({"ok": True, "update": public_status()})
                return
            super().do_GET()

        def do_POST(self):
            path = urlparse(self.path).path
            if path not in {"/api/update/check", "/api/update/start"}:
                super().do_POST()
                return
            if not self.require_control():
                return
            try:
                if path == "/api/update/check":
                    out = core.admin_call("update-check", {}, 220)
                else:
                    out = core.admin_call("update-start", {}, 240)
                self.send_json(out)
            except Exception as exc:
                self.send_json({"error": str(exc)[:800]}, 502)

    UpdateHandler.__name__ = f"Update{base.__name__}"
    return UpdateHandler
