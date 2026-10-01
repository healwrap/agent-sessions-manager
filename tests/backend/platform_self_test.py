"""Foreign-platform path and shell semantics checked without changing the host."""
import os
import shlex
import sqlite3
import tempfile
from pathlib import Path, PureWindowsPath
from unittest.mock import patch
from agent_sessions.paths import state_root, claude_root, file_uri_path
from agent_sessions.sources.base import readonly_db
from agent_sessions.context.handoff import quote_command

assert state_root('darwin', Path('/Users/example'), {}) == Path('/Users/example/Library/Application Support/Agent Sessions')
assert state_root('linux', Path('/home/example'), {'XDG_DATA_HOME': '/data/应用'}) == Path('/data/应用/agent-sessions')
assert state_root('linux', Path('/home/example'), {'XDG_DATA_HOME': 'relative'}) == Path('/home/example/.local/share/agent-sessions')
assert state_root('win32', PureWindowsPath('C:/Users/用户'), {'LOCALAPPDATA': 'D:/Local Data'}) == PureWindowsPath('D:/Local Data/Agent Sessions')
assert state_root('win32', PureWindowsPath('C:/Users/用户'), {}) == PureWindowsPath('C:/Users/用户/AppData/Local/Agent Sessions')
assert file_uri_path('file:///C:/Users/%E7%94%A8%E6%88%B7/My%20Project', 'win32') == 'C:\\Users\\用户\\My Project'
assert file_uri_path('file://server/share/My%20Project', 'win32') == '\\\\server\\share\\My Project'
assert file_uri_path('file://localhost/C:/Project', 'win32') == 'C:\\Project'
assert file_uri_path('file:///Users/example/My%20Project', 'darwin') == '/Users/example/My Project'
args = ["C:\\工具 文件\\server's.exe", '--read-session', 'value=$literal`&']
assert quote_command(args, 'win32') == "& 'C:\\工具 文件\\server''s.exe' '--read-session' 'value=$literal`&'"
assert shlex.split(quote_command(args, 'linux')) == args
with patch.dict(os.environ, {'CLAUDE_CONFIG_DIR': '/tmp/custom-claude'}):
    assert claude_root() == Path('/tmp/custom-claude')
with tempfile.TemporaryDirectory() as folder:
    path = Path(folder)/'会话 #?%.db'
    db = sqlite3.connect(path); db.execute('create table test(value)'); db.execute('insert into test values (42)'); db.commit(); db.close()
    db, temporary = readonly_db(path)
    assert db.execute('select value from test').fetchone() == (42,)
    assert temporary is None
    try:
        db.execute('insert into test values (43)')
        raise AssertionError('source must remain read-only')
    except sqlite3.OperationalError: pass
    db.close()
print('platform self-test: ok (native state roots, Unicode, drive and UNC URI, shell quoting, read-only SQLite)')
