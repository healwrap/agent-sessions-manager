"""Export only runtime skill sources, without local sessions or development caches."""
import sys
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'backend'))
from agent_sessions.skills.payload import export_payload

if __name__ == '__main__':
    target = Path(sys.argv[1])
    if target.exists(): shutil.rmtree(target)
    export_payload(ROOT, target)
