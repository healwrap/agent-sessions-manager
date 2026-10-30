"""Link authored local skills into an account's otherwise private Code config."""
import json
import os
import sys
from pathlib import Path


def sync_skills(config, enabled=True, home=None):
    config = Path(config)
    source = (Path(home) if home is not None else Path.home())/'.claude/skills'
    destination = config/'skills'
    manifest = config/'.agent-sessions-skills.json'
    if destination.is_symlink() or os.path.isjunction(destination):
        raise ValueError('此环境的 skills 目录指向其他目录，请先恢复为独立目录')
    previous = json.loads(manifest.read_text()) if manifest.exists() else {}
    if (not isinstance(previous, dict) or any(not isinstance(name, str) or Path(name).name != name
            or name in ('.', '..') or not isinstance(target, str) for name, target in previous.items())):
        raise ValueError('本机 skills 继承记录格式无效')
    available = {entry.name: str(entry) for entry in sorted(source.iterdir())
                 if not entry.name.startswith('.') and entry.name != 'synced' and (entry/'SKILL.md').is_file()
                 } if enabled and source.is_dir() else {}
    # Only remove links created by this application, never local skills or account-synced content.
    managed = {}
    for name, target in previous.items():
        path = destination/name
        linked = path.is_symlink() or os.path.isjunction(path)
        if linked and path.resolve() == Path(target).resolve():
            if available.get(name) == target: managed[name] = target
            elif os.path.isjunction(path): path.rmdir()
            else: path.unlink()
    inherited, overrides = [], []
    if available:
        destination.mkdir(parents=True, exist_ok=True)
        for name, target in available.items():
            path = destination/name
            if not os.path.lexists(path):
                if sys.platform == 'win32':
                    import _winapi
                    _winapi.CreateJunction(target, str(path))
                else: path.symlink_to(target, target_is_directory=True)
                managed[name] = target
            if (path.is_symlink() or os.path.isjunction(path)) and path.resolve() == Path(target).resolve(): inherited.append(name)
            else: overrides.append(name)
    if available or previous or manifest.exists():
        config.mkdir(parents=True, exist_ok=True)
        temporary = manifest.with_suffix('.tmp')
        temporary.write_text(json.dumps(managed, ensure_ascii=False, indent=2))
        temporary.chmod(0o600)
        temporary.replace(manifest)
    return {'enabled': enabled, 'source': str(source), 'inherited': inherited, 'overrides': overrides}
