"""Native user directories and file URIs, without machine-specific paths."""
import os
import sys
from pathlib import Path, PureWindowsPath
from urllib.parse import unquote, urlparse


def state_root(platform=None, home=None, environ=None):
    platform = platform or sys.platform
    home = home if home is not None else Path.home()
    env = os.environ if environ is None else environ
    if platform == 'darwin': return home/'Library/Application Support/Agent Sessions'
    if platform == 'win32':
        base = env.get('LOCALAPPDATA') or env.get('APPDATA')
        return (type(home)(base) if base else home/'AppData/Local')/'Agent Sessions'
    base = type(home)(env.get('XDG_DATA_HOME', ''))
    return (base if base.is_absolute() else home/'.local/share')/'agent-sessions'


def claude_root():
    return Path(os.environ.get('CLAUDE_CONFIG_DIR') or Path.home()/'.claude').expanduser()


def claude_desktop_root(platform=None, home=None, environ=None):
    platform = platform or sys.platform
    home = home if home is not None else Path.home()
    env = os.environ if environ is None else environ
    if platform == 'darwin': base = home/'Library/Application Support'
    elif platform == 'win32': base = type(home)(env.get('APPDATA') or home/'AppData/Roaming')
    else: base = type(home)(env.get('XDG_CONFIG_HOME') or home/'.config')
    return base/'Claude/claude-code-sessions'


def file_uri_path(value, platform=None):
    parsed = urlparse(value)
    if parsed.scheme != 'file': return value
    path, host = unquote(parsed.path), unquote(parsed.netloc)
    if (platform or sys.platform) == 'win32':
        if host and host.casefold() != 'localhost': path = '//'+host+path
        elif len(path) > 2 and path[0] == '/' and path[2] == ':': path = path[1:]
        return str(PureWindowsPath(path))
    return '//'+host+path if host and host != 'localhost' else path
