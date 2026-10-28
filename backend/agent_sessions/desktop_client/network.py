"""Supply the same loopback proxy to Chromium and the profile's embedded Code client."""
import json
import shlex
import subprocess
import sys
from pathlib import Path


def configure(config, relay):
    endpoint = 'http://127.0.0.1:'+str(relay.server_port)
    values = {key: endpoint for key in ('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy')}
    values.update(NO_PROXY='localhost,127.0.0.1,::1', no_proxy='localhost,127.0.0.1,::1')
    launcher = [sys.executable] if getattr(sys, 'frozen', False) else [sys.executable, str(Path(__file__).resolve().parents[3]/'scripts/trajectory_server.py')]
    quote = subprocess.list2cmdline if sys.platform == 'win32' else shlex.join
    command = quote([*launcher, '--proxy-tunnel', str(relay.server_port), '%h', '%p'])
    values.update(GIT_SSH_COMMAND=quote(['ssh', '-o', 'ProxyCommand='+command]), GIT_SSH_VARIANT='ssh')
    path = Path(config)/'settings.json'
    settings = json.loads(path.read_text()) if path.exists() else {}
    settings['env'] = {**settings.get('env', {}), **values}
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(settings, ensure_ascii=False, indent=2))
    temporary.chmod(0o600)
    temporary.replace(path)
    return values
