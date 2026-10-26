"""Locate the real browser executable, bypassing external manager launchers."""
from functools import lru_cache
import mmap
import hashlib
import os
from pathlib import Path
import plistlib
import sys


@lru_cache(maxsize=12)
def fingerprint_capable(path, modified):
    executable = Path(path)
    framework = executable.parents[1]/'Frameworks/Chromium Framework.framework/Chromium Framework'
    binary = framework if framework.is_file() else executable
    try:
        with binary.open('rb') as handle, mmap.mmap(handle.fileno(), 0, access=mmap.ACCESS_READ) as data:
            return data.find(b'fingerprint-platform-version') >= 0
    except OSError:
        return False


def discover():
    candidates = []
    override = os.environ.get('AGENT_SESSIONS_BROWSER')
    if override: candidates.append((Path(override).expanduser(), '指定内核'))
    if sys.platform == 'darwin':
        for root in (Path('/Applications'), Path.home()/'Applications'):
            for name in ('Fingerprint Chromium.app', 'Chromium.app', 'CCBaga-B.app'):
                candidates.append((root/name/'Contents/MacOS/Chromium', name[:-4]))
    for path, source in candidates:
        if not path.is_file() or not os.access(path, os.X_OK): continue
        if not fingerprint_capable(str(path), path.stat().st_mtime_ns): continue
        version = ''
        try:
            with (path.parents[1]/'Info.plist').open('rb') as handle:
                version = str(plistlib.load(handle).get('CFBundleShortVersionString', ''))
        except (OSError, ValueError): pass
        return {'available': True, 'name': 'Fingerprint Chromium', 'version': version,
                'path': str(path), 'source': source}
    return {'available': False, 'name': 'Fingerprint Chromium', 'version': '', 'path': '', 'source': ''}


def seed_number(value):
    return int.from_bytes(hashlib.sha256(value.encode()).digest()[:4], 'big') or 1
