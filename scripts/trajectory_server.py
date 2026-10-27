#!/usr/bin/env python3
"""Compatibility entry point; implementation lives in backend/agent_sessions."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/"backend"))
from agent_sessions.entry import main
if __name__ == "__main__":
    raise SystemExit(main())
