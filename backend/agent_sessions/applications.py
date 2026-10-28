"""Discover native and application-managed browsers and Claude Desktop."""
import json
import os
from pathlib import Path
import plistlib
import sys
from .paths import state_root
from .platform_process import appx_packages, windows_file_version


def app_executable(app):
    if app.get('executable'): return str(app['executable'])
    path = Path(app['path'])
    if path.suffix.lower() == '.app': return str(path/'Contents/MacOS'/('Claude' if app['id'] == 'claude' else 'Google Chrome'))
    return str(path)


def app_version(path):
    path = Path(path)
    if sys.platform == 'win32' and path.is_file(): return windows_file_version(str(path), path.stat().st_mtime_ns)
    if path.suffix.lower() == '.app':
        try: return str(plistlib.loads((path/'Contents/Info.plist').read_bytes())['CFBundleShortVersionString'])
        except (OSError, ValueError, KeyError): pass
    return ''


def managed_app(directory, key):
    root = Path(directory)/'components'/key
    try:
        value = json.loads((root/'current.json').read_text())
        app = Path(value['path'])
        package = None
        if value.get('package_full_name') and sys.platform == 'win32':
            package = next((row for row in appx_packages() if row['PackageFullName'] == value['package_full_name']
                            or value.get('package_family_name') and row['PackageFamilyName'] == value['package_family_name']), None)
            if not package: return None
        elif not app.resolve().is_relative_to(root.resolve()): return None
        executable = Path(value['executable'])
        if package:
            root = Path(package['InstallLocation'])
            executable = next((root/relative for relative in ('app/Claude.exe', 'Claude.exe') if (root/relative).is_file()), executable)
            app = executable
        if not executable.is_file(): return None
        return {'id': 'chrome' if key == 'chrome' else 'claude', 'name': ('Google Chrome' if sys.platform == 'darwin' else 'Google Chrome for Testing') if key == 'chrome' else 'Claude',
                'path': str(app), 'executable': str(executable), 'version': app_version(app if sys.platform == 'darwin' else executable) or value['version'],
                'managed': True, 'component': key, **({'version': package['Version'], 'package_full_name': package['PackageFullName']} if package else {})}
    except (OSError, ValueError, KeyError): return None


def installed_apps(directory=None):
    directory = directory or state_root()
    result = [row for key in ('chrome', 'claude') if (row := managed_app(directory, key))]
    if sys.platform == 'darwin':
        roots = [Path('/Applications'), Path.home()/'Applications', Path.home()/'Desktop']
        for key, name in [('claude', 'Claude.app'), ('chrome', 'Google Chrome.app')]:
            if any(row['id'] == key for row in result): continue
            path = next((root/name for root in roots if (root/name).is_dir()), None)
            if path: result.append({'id': key, 'name': name[:-4], 'path': str(path), 'version': app_version(path), 'managed': False})
    elif sys.platform == 'win32':
        local = Path(os.environ.get('LOCALAPPDATA') or Path.home()/'AppData/Local')
        roots = [local, Path(os.environ.get('PROGRAMFILES', 'C:/Program Files')), Path(os.environ.get('PROGRAMFILES(X86)', 'C:/Program Files (x86)'))]
        candidates = [('chrome', root/'Google/Chrome/Application/chrome.exe') for root in roots]
        candidates += [('claude', root/'Claude/Claude.exe') for root in roots]
        candidates += [('claude', path) for parent in (local/'AnthropicClaude', local/'Claude') for path in sorted(parent.glob('app-*/Claude.exe'), reverse=True)]
        if not any(row['id'] == 'claude' for row in result):
            for package in appx_packages():
                root = Path(package['InstallLocation'])
                for relative in ('app/Claude.exe', 'Claude.exe'):
                    path = root/relative
                    if path.is_file():
                        result.append({'id': 'claude', 'name': 'Claude', 'path': str(path), 'executable': str(path),
                                       'version': package['Version'], 'package_full_name': package['PackageFullName'], 'managed': False})
                        break
        for key, path in candidates:
            if path.is_file() and not any(row['id'] == key for row in result):
                result.append({'id': key, 'name': 'Claude' if key == 'claude' else 'Google Chrome',
                               'path': str(path), 'executable': str(path), 'version': app_version(path), 'managed': False})
    return result
