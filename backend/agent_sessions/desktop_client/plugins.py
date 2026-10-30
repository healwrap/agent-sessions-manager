"""Seed plugin programs while retaining each account's settings and credentials."""
import json
import os
from pathlib import Path
import tempfile
from .plugin_library import catalog, publish, read_json
from agent_sessions.paths import is_junction


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, name = tempfile.mkstemp(prefix='.'+path.name+'-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
        Path(name).replace(path)
    finally:
        Path(name).unlink(missing_ok=True)


def sync_plugins(config, library, enabled=True, home=None):
    config = Path(config)
    for path in (config/'plugins', config/'plugins/data', config/'settings.json'):
        if path.is_symlink() or is_junction(path):
            raise ValueError('此环境的插件配置或数据指向其他目录，请先恢复为独立目录')
    source = Path(home) if home is not None else Path.home()
    rows = catalog(source) if enabled else []
    seed = publish(library, rows) if rows else None
    if seed:
        known_file = config/'plugins/known_marketplaces.json'
        known = read_json(known_file)
        original_known = dict(known)
        for market, entry in read_json(seed/'known_marketplaces.json').items():
            current = known.get(market)
            if not current or Path(current.get('installLocation', '')).is_relative_to(Path(library).resolve()/'seeds'):
                known[market] = entry
        if known != original_known: write_json(known_file, known)
    manifest = config/'.agent-sessions-plugins.json'
    previous = read_json(manifest)
    managed = previous.get('plugins', {})
    versions = previous.get('versions', {})
    if not isinstance(managed, dict) or any(type(value) is not bool for value in managed.values()):
        raise ValueError('本机插件继承记录无效')
    path = config/'settings.json'
    settings = read_json(path)
    original = json.dumps(settings, sort_keys=True)
    flags = settings.setdefault('enabledPlugins', {})
    if not isinstance(flags, dict) or any(type(value) is not bool for value in flags.values()):
        raise ValueError('此环境的插件启用配置无效')
    own = set()
    for key, records in read_json(config/'plugins/installed_plugins.json').get('plugins', {}).items():
        for record in records:
            installed = Path(record['installPath'])
            metadata = read_json(installed/'.agent-sessions-package.json')
            inherited = (installed.resolve().is_relative_to(Path(library).resolve()) or metadata.get('id') == key
                         or (key in managed and not installed.exists() and record.get('version') == versions.get(key)))
            if not inherited: own.add(key)
    current = {row['id']: row for row in rows}
    remembered = {}
    for key, value in managed.items():
        if key not in own and (not enabled or key not in current):
            remembered[key] = value if previous.get('enabled') is False else flags.get(key, value)
            flags[key] = False
    inherited, overrides = [], []
    for row in rows:
        key = row['id']
        if key in own:
            overrides.append(key)
            continue
        if previous.get('enabled') is False and key in managed and flags.get(key) is False:
            flags[key] = managed[key]
        else: flags.setdefault(key, row['enabled'])
        remembered[key] = flags[key]
        inherited.append(dict(id=key, version=row['version'], enabled=flags[key]))
    if json.dumps(settings, sort_keys=True) != original and (enabled or managed): write_json(path, settings)
    versions.update({row['id']: row['version'] for row in rows})
    write_json(manifest, dict(enabled=enabled, plugins=remembered,
                             versions={key: versions[key] for key in remembered if key in versions},
                             seed_directory=str(seed) if seed else ''))
    env = {'CLAUDE_SECURESTORAGE_CONFIG_DIR': str(config)}
    if seed:
        env.update(CLAUDE_CODE_PLUGIN_SEED_DIR=str(seed), CLAUDE_CODE_SYNC_PLUGIN_INSTALL='1')
    return dict(enabled=enabled, source=str(source/'.claude/plugins/cache'), inherited=inherited,
                overrides=overrides, seed_directory=str(seed) if seed else '', environment=env)
