"""Build a complete, versioned skill payload with an application-backed CLI."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile

NAME = 'agent-sessions'
MARKER = '.agent-sessions-install.json'


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def source_files(root):
    paths = [root/name for name in ('SKILL.md', 'README.md', 'requirements.txt', 'agents/openai.yaml')]
    paths += list((root/'references').rglob('*.md'))
    paths += [path for path in (root/'backend/agent_sessions').rglob('*') if path.suffix in ('.py', '.json') and '__pycache__' not in path.parts]
    return {path.relative_to(root).as_posix(): path.read_bytes() for path in sorted(paths) if path.is_file()}


def wrapper(context=False):
    extra = "['--skill-context'] + " if context else ''
    return f'''#!/usr/bin/env python3
"""Run the Agent Sessions application CLI without importing a development checkout."""
import json
from pathlib import Path
import subprocess
import sys
root = Path(__file__).resolve().parents[1]
command = json.loads((root/'runtime.json').read_text())['command']
raise SystemExit(subprocess.call(command + {extra}sys.argv[1:]))
'''.encode()


def export_payload(root, target):
    files = source_files(root)
    files['scripts/trajectory_server.py'] = wrapper()
    files['scripts/session_context.py'] = wrapper(True)
    files['runtime_entry.py'] = b'''import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent/'backend'))
from agent_sessions.entry import main
raise SystemExit(main())
'''
    manifest = {name: hashlib.sha256(content).hexdigest() for name, content in files.items()}
    for name, content in files.items():
        path = target/name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    (target/'payload.json').write_text(json.dumps({'version': digest(manifest), 'files': manifest}, ensure_ascii=False))


class SkillPayload:
    def __init__(self, state):
        self.directory = Path(state)/'skills'
        self.development = None if getattr(sys, 'frozen', False) else Path(__file__).resolve().parents[3]
        self.bundled = Path(getattr(sys, '_MEIPASS', ''))/'skill-payload'
        self.version, self.path = '', None

    def ensure(self):
        if self.development:
            files = source_files(self.development)
            fingerprint = digest({name: hashlib.sha256(content).hexdigest() for name, content in files.items()})
        else:
            fingerprint = json.loads((self.bundled/'payload.json').read_text())['version']
        if self.version == fingerprint and self.path and self.path.exists(): return self.path
        version = self.directory/'versions'/fingerprint/NAME
        if not version.exists():
            version.parent.mkdir(parents=True, exist_ok=True)
            staging = Path(tempfile.mkdtemp(prefix='skill-', dir=version.parent))
            try:
                if self.development: export_payload(self.development, staging)
                else: shutil.copytree(self.bundled, staging, dirs_exist_ok=True)
                command = [sys.executable] if not self.development else [sys.executable, str(version/'runtime_entry.py')]
                (staging/'runtime.json').write_text(json.dumps({'command': command}, ensure_ascii=False))
                metadata = json.loads((staging/'payload.json').read_text())
                metadata.update(version=fingerprint, files={**metadata['files'], 'runtime.json': hashlib.sha256((staging/'runtime.json').read_bytes()).hexdigest()})
                (staging/MARKER).write_text(json.dumps(metadata, ensure_ascii=False))
                staging.rename(version)
            finally:
                if staging.exists(): shutil.rmtree(staging)
        self.directory.mkdir(parents=True, exist_ok=True)
        temporary = self.directory/'current.next'
        temporary.unlink(missing_ok=True)
        temporary.symlink_to(version.parent, target_is_directory=True)
        temporary.replace(self.directory/'current')
        self.version, self.path = fingerprint, version
        return version

    @property
    def current(self):
        return self.directory/'current'/NAME

    def info(self):
        path = self.ensure()
        return {'name': 'Agent Sessions', 'id': NAME, 'version': self.version[:12],
                'path': str(self.current), 'document': (path/'SKILL.md').read_text(),
                'source': '本地源码打包' if self.development else '应用内置'}
