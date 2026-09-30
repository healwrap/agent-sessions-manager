#!/usr/bin/env python3
"""Build a self-contained macOS app, including Python, assets and source adapters."""
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
    python = ROOT/'.venv-desktop/bin/python'
    if not python.exists():
        run(sys.executable, '-m', 'venv', ROOT/'.venv-desktop')
    if subprocess.run([str(python), '-c', 'import PyInstaller'], capture_output=True).returncode:
        run(python, '-m', 'pip', 'install', 'pyinstaller==6.22.3')
    cli = ROOT/'node_modules/.bin/tauri'
    if not cli.exists(): run('npm', 'ci')
    run(python, '-m', 'PyInstaller', '--noconfirm', '--clean', '--onefile',
        '--name', 'agent-sessions-server', '--paths', ROOT/'scripts',
        '--add-data', str(ROOT/'assets')+':assets', ROOT/'scripts/trajectory_server.py')
    triple = subprocess.check_output(['rustc', '--print', 'host-tuple'], text=True).strip()
    directory = ROOT/'desktop/binaries'
    directory.mkdir(exist_ok=True)
    shutil.copy2(ROOT/'dist/agent-sessions-server', directory/('agent-sessions-server-'+triple))
    with tempfile.TemporaryDirectory(prefix='agent-sessions-icons-') as icons:
        run(cli, 'icon', ROOT/'desktop/icons/source.svg', '--output', icons)
        for name in ('icon.png', 'icon.icns'):
            shutil.copy2(Path(icons)/name, ROOT/'desktop/icons'/name)
    run(cli, 'build', '--bundles', 'app', '--config', ROOT/'desktop/tauri.conf.json', cwd=ROOT/'desktop')
    app = ROOT/'desktop/target/release/bundle/macos/Agent Sessions.app'
    output = ROOT/'desktop/target/release/bundle/dmg'/f'Agent Sessions_0.1.0_{triple.split("-")[0]}.dmg'
    output.parent.mkdir(parents=True, exist_ok=True)
    # A plain installation image avoids Finder automation during packaging.
    with tempfile.TemporaryDirectory(prefix='agent-sessions-dmg-') as staging:
        run('ditto', app, Path(staging)/app.name)
        (Path(staging)/'Applications').symlink_to('/Applications')
        run('hdiutil', 'create', '-volname', 'Agent Sessions', '-srcfolder', staging,
            '-ov', '-format', 'UDZO', output)
    print('App:', app)
    print('DMG:', output)


if __name__ == '__main__': main()
