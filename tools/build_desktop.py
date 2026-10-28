#!/usr/bin/env python3
"""Build native desktop bundles on the current host, including the Python sidecar."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run(*args, cwd=ROOT):
    subprocess.run([str(a) for a in args], cwd=cwd, check=True)


def main():
    windows = sys.platform == 'win32'
    python = ROOT/('.venv-desktop/Scripts/python.exe' if windows else '.venv-desktop/bin/python')
    if not python.exists():
        run(sys.executable, '-m', 'venv', ROOT/'.venv-desktop')
    if subprocess.run([str(python), '-c', 'import PyInstaller'], capture_output=True).returncode:
        run(python, '-m', 'pip', 'install', 'pyinstaller==6.22.3')
    run(python, '-m', 'pip', 'install', '-r', ROOT/'requirements.txt')
    cli = ROOT/('node_modules/.bin/tauri.cmd' if windows else 'node_modules/.bin/tauri')
    npm = shutil.which('npm.cmd' if windows else 'npm') or 'npm'
    if not cli.exists(): run(npm, 'ci')
    run(npm, 'run', 'build:ui')
    run(python, ROOT/'tools/build_skill_bundle.py', ROOT/'build/skill-payload')
    run(python, '-m', 'PyInstaller', '--noconfirm', '--clean', '--onefile',
        '--name', 'agent-sessions-server', '--paths', ROOT/'backend',
        '--collect-all', 'tzdata',
        '--add-data', str(ROOT/'frontend/dist')+os.pathsep+'frontend/dist',
        '--add-data', str(ROOT/'backend/agent_sessions/browser/locales.json')+os.pathsep+'agent_sessions/browser',
        '--add-data', str(ROOT/'build/skill-payload')+os.pathsep+'skill-payload',
        ROOT/'scripts/trajectory_server.py')
    triple = subprocess.check_output(['rustc', '--print', 'host-tuple'], text=True).strip()
    directory = ROOT/'desktop/binaries'
    directory.mkdir(exist_ok=True)
    extension = '.exe' if windows else ''
    shutil.copy2(ROOT/('dist/agent-sessions-server'+extension), directory/('agent-sessions-server-'+triple+extension))
    with tempfile.TemporaryDirectory(prefix='agent-sessions-icons-') as icons:
        source = 'source-macos.png' if sys.platform == 'darwin' else 'source.png'
        run(cli, 'icon', ROOT/'desktop/icons'/source, '--output', icons)
        for name in ('icon.png', 'icon.icns', 'icon.ico'):
            shutil.copy2(Path(icons)/name, ROOT/'desktop/icons'/name)
    bundles = 'app' if sys.platform == 'darwin' else 'nsis' if windows else 'deb,appimage'
    run(cli, 'build', '--bundles', bundles, cwd=ROOT/'desktop')
    if sys.platform != 'darwin':
        print('Bundles:', ROOT/'desktop/target/release/bundle')
        return
    app = ROOT/'desktop/target/release/bundle/macos/Agent Sessions.app'
    run('codesign', '--force', '--deep', '--sign', '-', app)
    version = json.loads((ROOT/'desktop/tauri.conf.json').read_text(encoding='utf-8'))['version']
    output = ROOT/'desktop/target/release/bundle/dmg'/f'Agent Sessions_{version}_{triple.split("-")[0]}.dmg'
    output.parent.mkdir(parents=True, exist_ok=True)
    # A plain installation image avoids Finder automation during packaging.
    with tempfile.TemporaryDirectory(prefix='agent-sessions-dmg-') as staging:
        run('ditto', app, Path(staging)/app.name)
        (Path(staging)/'Applications').symlink_to('/Applications')
        run('hdiutil', 'create', '-volname', 'Agent Sessions', '-srcfolder', staging,
            '-fs', 'HFS+', '-ov', '-format', 'UDZO', output)
    print('App:', app)
    print('DMG:', output)


if __name__ == '__main__': main()
