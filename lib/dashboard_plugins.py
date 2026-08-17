#!/usr/bin/env python3
"""Trusted WebUI routes for the YWD-Hotspot Plugin Manager."""
from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import dashboard_core as core
import plugin_manager
import plugin_service_manager


def current_snapshot():
    base = plugin_manager.snapshot(core.brief_health())
    service_rows = plugin_service_manager.snapshot()
    plugins = list(base.get("plugins", [])) + service_rows
    system = dict(base.get("system", {}))
    enabled = bool(system.get("enabled", False))
    system.update({
        "installed": len(plugins),
        "enabled_plugins": sum(1 for p in plugins if p.get("enabled")),
        "active_plugins": sum(1 for p in plugins if p.get("health") == "active"),
        "health": "disabled" if not enabled else ("error" if any(p.get("health") == "error" for p in plugins) else "good"),
        "execution_model": "declarative + sandboxed services",
        "service_api": plugin_service_manager.API_VERSION,
    })
    return {"api": base.get("api", 1), "system": system, "plugins": plugins}


def test_plugin(ident):
    try:
        plugin_manager.get_plugin(ident)
    except plugin_manager.PluginError:
        return plugin_service_manager.test_plugin(ident)
    return plugin_manager.test_plugin(ident, core.brief_health(force=True))


def wrap_handler(base):
    class PluginHandler(base):
        def do_GET(self):
            parsed = urlparse(self.path)
            path = parsed.path
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
            if path == "/api/plugins/logs":
                if not self.require_control():
                    return
                qs = parse_qs(parsed.query, keep_blank_values=False)
                ident = str((qs.get("id") or [""])[0])[:80]
                try:
                    plugin = plugin_service_manager.get_plugin(ident)
                    self.send_json({"ok": True, "id": ident, "service": plugin["service"],
                                    "lines": core.journal(plugin["service"], 120)})
                except ValueError as exc:
                    self.send_json({"error": str(exc)[:800]}, 400)
                except Exception as exc:
                    self.send_json({"error": str(exc)[:800]}, 502)
                return
            super().do_GET()

        def do_POST(self):
            path = urlparse(self.path).path
            routes = {
                "/api/plugins/system": "plugin-system-set",
                "/api/plugins/enable": "plugin-set",
                "/api/plugins/config": "plugin-config-save",
                "/api/plugins/runtime": "plugin-runtime",
            }
            if path not in set(routes) | {"/api/plugins/test"}:
                super().do_POST()
                return
            if not self.require_control():
                return
            try:
                body = self.body_json()
                if path == "/api/plugins/test":
                    out = test_plugin(body.get("id"))
                else:
                    out = core.admin_call(routes[path], body, 40)
                self.send_json({**out, "plugins_state": current_snapshot()})
            except ValueError as exc:
                self.send_json({"error": str(exc)[:800]}, 400)
            except Exception as exc:
                self.send_json({"error": str(exc)[:800]}, 502)

    PluginHandler.__name__ = f"Plugin{base.__name__}"
    return PluginHandler
