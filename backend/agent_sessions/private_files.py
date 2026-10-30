"""Private JSON writes and local ephemeral port allocation."""
import json
import os
from pathlib import Path
import socket


def private_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_suffix('.tmp')
    with open(temporary, 'w', opener=lambda name, flags: os.open(name, flags, 0o600)) as output:
        json.dump(value, output, ensure_ascii=False, indent=2)
    temporary.chmod(0o600)
    temporary.replace(path)


def free_port():
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        return listener.getsockname()[1]
