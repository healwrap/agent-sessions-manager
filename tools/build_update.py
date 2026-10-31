"""Create signed update artifacts after the complete desktop bundle is signed."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]


def build(version, triple):
    env = dict(os.environ)
    configured = env.get('TAURI_SIGNING_PRIVATE_KEY')
    key_path = env.get('TAURI_SIGNING_PRIVATE_KEY_PATH')
    local = Path.home()/'.config/agent-sessions/updater/desktop.key'
    if not configured and not key_path and local.is_file(): key_path = str(local)
    if not configured and not key_path:
        if env.get('AGENT_SESSIONS_REQUIRE_UPDATE_SIGNATURE') == '1':
            raise ValueError('发布更新需要配置 TAURI_SIGNING_PRIVATE_KEY，未生成未签名更新包')
        print('未配置更新签名密钥；本次仅生成普通安装包。')
        return
    if configured:
        try:
            if Path(configured).is_file(): key_path = configured; env.pop('TAURI_SIGNING_PRIVATE_KEY', None)
        except OSError: pass
    env.setdefault('TAURI_SIGNING_PRIVATE_KEY_PASSWORD', '')
    output = ROOT/'dist/updates'
    output.mkdir(parents=True, exist_ok=True)
    arch = triple.split('-')[0]
    if sys.platform == 'darwin':
        target = 'darwin-'+arch
        artifact = output/f'Agent-Sessions_{version}_{target}.app.tar.gz'
        app = ROOT/'desktop/target/release/bundle/macos/Agent Sessions.app'
        with tarfile.open(artifact, 'w:gz', dereference=False) as archive:
            archive.add(app, arcname=app.name)
    elif sys.platform == 'win32':
        target = 'windows-'+arch
        installers = list((ROOT/'desktop/target/release/bundle/nsis').glob('*.exe'))
        if len(installers) != 1: raise ValueError('无法确定本次 Windows 安装包')
        artifact = output/f'Agent-Sessions_{version}_{target}-setup.exe'
        shutil.copy2(installers[0], artifact)
    else:
        print('当前自动发布仅配置 macOS 和 Windows。')
        return
    cli = ROOT/('node_modules/.bin/tauri.cmd' if sys.platform == 'win32' else 'node_modules/.bin/tauri')
    args = [str(cli), 'signer', 'sign', '--app-version', version]
    if key_path: args += ['--private-key-path', key_path]
    args.append(str(artifact))
    result = subprocess.run(args, env=env, capture_output=True, text=True)
    if result.returncode: raise ValueError('更新签名失败，请检查本机密钥或 CI 签名配置')
    signature = artifact.with_suffix(artifact.suffix+'.sig')
    subprocess.run(['node', str(ROOT/'tools/verify_update.mjs'), str(artifact), str(signature),
                    str(ROOT/'desktop/updater.pub'), version], check=True)
    notes_file = os.environ.get('AGENT_SESSIONS_RELEASE_NOTES')
    notes = Path(notes_file).read_text(encoding='utf-8') if notes_file else 'Agent Sessions '+version
    manifest = {'version': version, 'notes': notes, 'pub_date': datetime.now(timezone.utc).isoformat(),
                'platforms': {target: {'url': 'https://github.com/healwrap/agent-sessions-manager/releases/download/v'+version+'/'+quote(artifact.name),
                                       'signature': signature.read_text(encoding='utf-8').strip()}}}
    (output/(target+'.json')).write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print('Signed updater artifact:', artifact)


if __name__ == '__main__':
    version = json.loads((ROOT/'desktop/tauri.conf.json').read_text())['version']
    triple = subprocess.check_output(['rustc', '--print', 'host-tuple'], text=True).strip()
    build(version, triple)
