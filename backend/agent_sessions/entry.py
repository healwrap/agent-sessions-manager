"""Dispatch the packaged desktop server and installed skill context CLI."""
import sys


def main():
    if sys.argv[1:2] == ['--skill-context']:
        from agent_sessions.context.cli import main as context
        return context(sys.argv[2:])
    from agent_sessions.api.server import main as server
    return server()
