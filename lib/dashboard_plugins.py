#!/usr/bin/env python3
"""Trusted WebUI routes for the YWD-Hotspot Plugin Manager."""
from __future__ import annotations

from urllib.parse import urlparse

import dashboard_core as core
import plugin_manager


def current_snapshot():
    return plugin_manager.snapshot(core.brief_health())


def wrap_handler(base):
    class PluginHandler(base):
        def do_GET(self):
            path = urlparse(self.path).path
            static = {
                "/plugin-manager.js": ("plugin-manager.js", "application/javascript; charset=utf-8"),
                "/plugin-manager.css": ("plugin-manager.css", "text/css; charset=utf-8"),
            }
            if path in static:
                name, mime = static[path]
                self.serve_static(name, mime)
                return
            if path == "/api/plugins":
                try:
                    self.send_json({"ok": True, **current_snapshot()})
                except Exception as exc:
                    self.send_json({"error": str(exc)[:800]}, 500)
                return
            super().do_GET()

        def do_POST(self):
            path = urlparse(self.path).path
            routes = {
                "/api/plugins/system": "plugin-system-set",
                "/api/plugins/enable": "plugin-set",
                "/api/plugins/config": "plugin-config-save",
            }
            if path not in set(routes) | {"/api/plugins/test"}:
                super().do_POST()
                return
            if not self.require_control():
                return
            try:
                body = self.body_json()
                if path == "/api/plugins/test":
                    out = plugin_manager.test_plugin(body.get("id"), core.brief_health(force=True))
                else:
                    out = core.admin_call(routes[path], body, 35)
                self.send_json({**out, "plugins_state": current_snapshot()})
            except ValueError as exc:
                self.send_json({"error": str(exc)[:800]}, 400)
            except Exception as exc:
                self.send_json({"error": str(exc)[:800]}, 502)

    PluginHandler.__name__ = f"Plugin{base.__name__}"
    return PluginHandler
