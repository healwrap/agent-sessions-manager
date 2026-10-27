"""Read actual entries, including broken symlinks and locally modified copies."""
import hashlib
import json
import os
import re
from pathlib import Path
from .payload import MARKER, digest


def entry_fingerprint(path):
    path = Path(path)
    if path.is_symlink(): return digest({'link': os.readlink(path)})
    if not path.exists(): return 'missing'
    if not path.is_dir(): return digest({'file': hashlib.sha256(path.read_bytes()).hexdigest()})
    rows = {}
    for item in sorted(path.rglob('*')):
        if '__pycache__' in item.parts: continue
        name = item.relative_to(path).as_posix()
        if item.is_symlink(): rows[name] = {'link': os.readlink(item)}
        elif item.is_file(): rows[name] = hashlib.sha256(item.read_bytes()).hexdigest()
    return digest(rows)


def inspect_entry(path, payload):
    path = Path(path)
    result = {'method': 'link' if path.is_symlink() else 'copy', 'managed': False, 'version': '',
              'resolved_path': str(path.resolve()), 'exists': os.path.lexists(path), 'modified_files': []}
    if not result['exists']: return {**result, 'method': 'link', 'state': 'missing', 'note': '此安装入口不存在'}
    if path.is_symlink() and not path.exists(): return {**result, 'state': 'broken', 'note': '符号链接存在，但目标已失效'}
    document = path/'SKILL.md'
    if not document.is_file(): return {**result, 'state': 'modified', 'note': '入口内没有可读取的 SKILL.md；替换前会备份原入口'}
    if not re.search(r'''(?m)^name:\s*['"]?agent-sessions['"]?\s*$''', document.read_text()):
        return {**result, 'state': 'modified', 'note': '此入口中的 Skill 名称不是 agent-sessions，替换前会备份原入口'}
    if payload.development and path.resolve() == payload.development.resolve():
        return {**result, 'state': 'ready', 'version': payload.version[:12], 'note': '本地开发目录链接；源文件可读，Agent 加载情况需在新会话中验证', 'source': '本地开发目录'}
    marker = path/MARKER
    if not marker.is_file():
        return {**result, 'state': 'external', 'source': '外部安装', 'note': 'Skill 文件可读，版本未登记；更新时保留原入口备份'}
    manifest = json.loads(marker.read_text())
    if not isinstance(manifest.get('files'), dict): raise ValueError('安装清单格式无效')
    changed = []
    for name, expected in manifest['files'].items():
        if not isinstance(name, str) or Path(name).is_absolute() or '..' in Path(name).parts:
            raise ValueError('安装清单中的文件路径无效')
        item = path/name
        if not item.is_file() or hashlib.sha256(item.read_bytes()).hexdigest() != expected: changed.append(name)
    changed += [item.relative_to(path).as_posix() for item in path.rglob('*')
                if (item.is_file() or item.is_symlink()) and '__pycache__' not in item.parts
                and item.relative_to(path).as_posix() not in {*manifest['files'], MARKER, 'payload.json'}]
    version = manifest.get('version', '')
    managed = path.is_symlink() and path.resolve().is_relative_to(payload.directory.resolve())
    return {**result, 'managed': managed, 'version': version[:12], 'modified_files': changed,
            'source': '应用托管' if managed else '独立副本',
            'state': 'modified' if changed else 'ready' if version == payload.version else 'outdated',
            'note': '检测到文件修改，更新时先保留原入口备份' if changed else '文件已就绪；Agent 加载情况需在新会话中验证'}


def inspect_target(target, payload):
    if not target['path']:
        return {**target, 'state': 'unconfigured', 'method': 'link', 'managed': False, 'exists': False,
                'version': '', 'note': '尚未核对当前客户端的 Skill 入口，请配置完整路径', 'source': '', 'modified_files': []}
    try: result = inspect_entry(target['path'], payload)
    except (OSError, ValueError, KeyError, TypeError, RuntimeError) as error:
        return {**target, 'state': 'error', 'method': 'link' if Path(target['path']).is_symlink() else 'copy',
                'managed': False, 'exists': os.path.lexists(target['path']), 'version': '', 'source': '',
                'modified_files': [], 'note': '检测失败：'+str(error)}
    inherited = target.get('shared_path')
    if not result['exists'] and inherited and os.path.lexists(inherited):
        shared = inspect_entry(inherited, payload)
        if shared['state'] in ('ready', 'outdated', 'modified', 'external'):
            result.update(state='shared', effective_path=inherited, source='共享目录',
                          version=shared.get('version', ''), note='通过共享目录可读取；本行安装会新建专用入口，管理共享入口请使用「共享 Skill」')
    return {**target, **result}
