"""Dispatch the packaged desktop server and installed skill context CLI."""
import sys
from .runtime_version import require_python, runtime_info


def main():
    require_python()
    if sys.argv[1:] == ['--runtime-info']:
        import json
        print(json.dumps(runtime_info(), ensure_ascii=False))
        return 0
    if sys.argv[1:2] == ['--proxy-tunnel']:
        from agent_sessions.browser.stdio_proxy import main as tunnel
        return tunnel(sys.argv[2:])
    if sys.argv[1:2] == ['--skill-context']:
        from agent_sessions.context.cli import main as context
        return context(sys.argv[2:])
    from agent_sessions.api.server import main as server
    return server()
