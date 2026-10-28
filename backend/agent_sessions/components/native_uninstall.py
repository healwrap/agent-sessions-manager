"""Uninstall a discovered Claude application using the platform's own mechanism."""
from pathlib import Path
import plistlib
import subprocess
import sys
from agent_sessions.platform_process import appx_packages, background_options, powershell, ps_literal


def squirrel_updater(app):
    path = Path(app['path'])
    return next((root/'Update.exe' for root in (path.parent, path.parent.parent) if (root/'Update.exe').is_file()), None)


def removable(app):
    if sys.platform == 'darwin': return Path(app['path']).name == 'Claude.app'
    return sys.platform == 'win32' and bool(app.get('package_full_name') or squirrel_updater(app))


def uninstall(app):
    path = Path(app['path'])
    if sys.platform == 'darwin':
        metadata = plistlib.loads((path/'Contents/Info.plist').read_bytes())
        if path.name != 'Claude.app' or metadata.get('CFBundleIdentifier') != 'com.anthropic.claudefordesktop':
            raise ValueError('应用身份与 Claude 不符，卸载未执行')
        script = '''function run(argv) {
          ObjC.import('Foundation');
          if (!$.NSFileManager.defaultManager.trashItemAtURLResultingItemURLError($.NSURL.fileURLWithPath(argv[0]), null, null))
            throw Error('无法将应用移入废纸篓，请检查安装目录权限');
        }'''
        result = subprocess.run(['/usr/bin/osascript', '-l', 'JavaScript', '-e', script, str(path)], capture_output=True, text=True, timeout=60)
        if result.returncode: raise ValueError(result.stderr.strip() or '应用未能移入废纸篓')
    elif sys.platform == 'win32' and app.get('package_full_name'):
        package = app['package_full_name']
        powershell('Remove-AppxPackage -Package '+ps_literal(package), timeout=180)
        if any(row['PackageFullName'] == package for row in appx_packages(refresh=True)):
            raise ValueError('Windows 仍检测到 Claude 安装包，卸载未完成')
        return
    elif sys.platform == 'win32' and (updater := squirrel_updater(app)):
        powershell('$s=Get-AuthenticodeSignature -FilePath '+ps_literal(updater)+"; if($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notlike '*Anthropic*'){throw 'Claude 卸载程序签名不符'}")
        subprocess.run([str(updater), '--uninstall'], check=True, capture_output=True, timeout=180, **background_options())
    else: raise ValueError('此版本请使用系统的应用卸载入口')
    if path.exists(): raise ValueError('应用仍位于原安装位置，卸载未完成')
