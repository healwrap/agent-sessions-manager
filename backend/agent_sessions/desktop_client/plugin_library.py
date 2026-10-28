"""Publish installed user plugin programs as immutable, versioned seed libraries."""
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import re
import shutil
import tempfile
import threading
from .plugin_compat import REVISION, adapt

LOCK = threading.RLock()
IGNORED = {'.git', '__pycache__', '.DS_Store', '.send.log'}
COMPONENT = re.compile(r'[A-Za-z0-9][A-Za-z0-9._-]*\Z')
VERSION = re.compile(r'[A-Za-z0-9][A-Za-z0-9._+-]*\Z')


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8')) if path.is_file() else {}


def catalog(home):
    source = Path(home)/'.claude'
    records = read_json(source/'plugins/installed_plugins.json').get('plugins', {})
    flags = read_json(source/'settings.json').get('enabledPlugins', {})
    result = []
    for key, rows in sorted(records.items()):
        parts = key.split('@')
        if len(parts) != 2 or any(not COMPONENT.fullmatch(part) for part in parts):
            raise ValueError('本机插件标识无效：'+key)
        row = next((row for row in rows if row.get('scope') == 'user'), None)
        if not row: continue
        path = Path(row['installPath']).expanduser().resolve()
        # Only installed program caches are public. Account-synced plugins remain account-owned.
        if not path.is_relative_to((source/'plugins/cache').resolve()): continue
        manifest = read_json(path/'.claude-plugin/plugin.json')
        version = row.get('version', '')
        if (manifest.get('name') != parts[0] or not VERSION.fullmatch(version)
                or manifest.get('version', version) != version):
            raise ValueError('本机插件安装记录与程序不一致：'+key)
        if type(flags.get(key, True)) is not bool: raise ValueError('本机插件启用状态无效：'+key)
        result.append(dict(id=key, name=parts[0], marketplace=parts[1], version=version,
                           source=path, enabled=flags.get(key, True)))
    return result


def entries(directory):
    for root, dirs, files in os.walk(directory, followlinks=False):
        dirs[:] = sorted(name for name in dirs if name not in IGNORED)
        for name in sorted(dirs+files):
            if name not in IGNORED: yield Path(root)/name


def fingerprint(directory):
    digest = hashlib.sha256(str(REVISION).encode())
    for path in entries(directory):
        digest.update(str(path.relative_to(directory)).encode())
        if path.is_symlink():
            if not path.resolve().is_relative_to(directory):
                raise ValueError('插件包含指向程序目录外的链接：'+str(path))
            digest.update(os.readlink(path).encode())
        else:
            info = path.stat()
            digest.update(f'{info.st_size}:{info.st_mtime_ns}:{info.st_mode}'.encode())
    return digest.hexdigest()[:24]


def readonly(directory):
    if os.name == 'nt': return
    for path in entries(directory):
        if not path.is_symlink():
            path.chmod(0o555 if path.is_dir() else 0o444 | (path.stat().st_mode & 0o111))
    directory.chmod(0o555)


def link_directory(source, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if os.name == 'nt':
        import _winapi
        _winapi.CreateJunction(str(source), str(destination))
    else: destination.symlink_to(source, target_is_directory=True)


def package(library, row):
    digest = fingerprint(row['source'])
    destination = library/'packages'/row['marketplace']/row['name']/(row['version']+'-'+digest)
    if destination.is_dir(): return destination, digest
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix='.incoming-', dir=destination.parent))
    try:
        shutil.copytree(row['source'], temporary, dirs_exist_ok=True, symlinks=True,
                        ignore=lambda _, names: set(names) & IGNORED)
        changes = adapt(temporary, row['id'], row['version'])
        if fingerprint(row['source']) != digest:
            raise ValueError('本机插件正在更新，请完成更新后重新启动环境：'+row['id'])
        (temporary/'.agent-sessions-package.json').write_text(json.dumps({
            'id': row['id'], 'version': row['version'], 'fingerprint': digest,
            'compatibility_revision': REVISION, 'adapted_files': changes}, ensure_ascii=False, indent=2), encoding='utf-8')
        temporary.rename(destination)
        readonly(destination)
    finally:
        if temporary.exists(): shutil.rmtree(temporary)
    return destination, digest


def publish(library, rows):
    library = Path(library).resolve()
    with LOCK:
        packages = [(row, *package(library, row)) for row in rows]
        signature = json.dumps(dict(layout=2, plugins=[(row['id'], row['version'], digest) for row, _, digest in packages]))
        destination = library/'seeds'/hashlib.sha256(signature.encode()).hexdigest()[:24]
        if destination.is_dir(): return destination
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = Path(tempfile.mkdtemp(prefix='.incoming-', dir=destination.parent))
        try:
            markets = {}
            for row, program, _ in packages:
                name, market, version = row['name'], row['marketplace'], row['version']
                link_directory(program, temporary/'cache'/market/name/version)
                # Relative marketplace sources must physically remain inside that marketplace.
                # Hard links share immutable bytes without copying large dependency trees again.
                shutil.copytree(program, temporary/'marketplaces'/market/'plugins'/name,
                                copy_function=os.link, symlinks=True)
                markets.setdefault(market, []).append(dict(name=name, version=version, source='./plugins/'+name))
            known = {}
            for market, plugins in markets.items():
                location = destination/'marketplaces'/market
                known[market] = dict(source=dict(source='directory', path=str(location)),
                                     installLocation=str(location), autoUpdate=False,
                                     lastUpdated=datetime.now(timezone.utc).isoformat())
                folder = temporary/'marketplaces'/market/'.claude-plugin'
                folder.mkdir(parents=True)
                (folder/'marketplace.json').write_text(json.dumps(dict(name=market,
                    owner=dict(name='本机插件继承'), plugins=plugins), ensure_ascii=False, indent=2), encoding='utf-8')
            (temporary/'known_marketplaces.json').write_text(json.dumps(known, ensure_ascii=False, indent=2), encoding='utf-8')
            temporary.rename(destination)
            readonly(destination)
        finally:
            if temporary.exists(): shutil.rmtree(temporary)
        return destination
