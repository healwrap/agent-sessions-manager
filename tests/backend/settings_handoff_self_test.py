"""Settings persistence + executable cross-agent handoff, without history writes."""
import hashlib
import json
import shlex
import subprocess
import tempfile
import threading
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from http.server import ThreadingHTTPServer
from agent_sessions.api.server import Handler, configured_store
from agent_sessions.settings import AppSettings, ViewSettings
from agent_sessions.context.handoff import prompt, read

with tempfile.TemporaryDirectory() as folder:
    root = Path(folder); roots = [root/'codex', root/'Claude histories', root/'agy', root/'cli', root/'desktop', root/'dsh', root/'cursor']
    file = roots[1]/'projects/project/one.jsonl';file.parent.mkdir(parents=True)
    rows = [{'uuid': 'u', 'parentUuid': None, 'type': 'user', 'cwd': '/tmp/a project', 'sessionId': 'one', 'message': {'content': 'value=exact'}},
            {'uuid': 'a', 'parentUuid': 'u', 'type': 'assistant', 'message': {'content': '回答原话'}},
            {'uuid': 'u2', 'parentUuid': 'a', 'type': 'user', 'message': {'content': '后续问题'}}]
    file.write_text(''.join(json.dumps(row)+'\n' for row in rows))
    checksum = hashlib.sha256(file.read_bytes()).hexdigest()
    settings = AppSettings(root/'state', roots); preferences = ViewSettings(root/'state')
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    server.settings = preferences;server.app_settings = settings;server.store = configured_store(settings.read(), preferences)
    worker = threading.Thread(target=server.serve_forever, daemon=True);worker.start()
    base = f'http://127.0.0.1:{server.server_port}'
    def request(path, body=None, **headers):
        try:
            with urlopen(Request(base+path, data=json.dumps(body).encode() if body is not None else None, headers=headers)) as response:
                return response.status, json.loads(response.read())
        except HTTPError as error: return error.code, json.loads(error.read())
    try:
        config = request('/api/settings')[1]['value']
        assert config['theme'] == 'system'
        legacy = {key: value for key, value in config.items() if key != 'theme'}
        settings.path.parent.mkdir(parents=True, exist_ok=True)
        settings.path.write_text(json.dumps(legacy))
        assert settings.read()['theme'] == 'system'
        assert settings.validate(legacy)['theme'] == 'system'
        config['theme'] = 'dark'
        config['syncSeconds'] = 10;config['animations'] = False
        assert request('/api/settings', config)[0] == 200
        assert AppSettings(root/'state', roots).read()['syncSeconds'] == 10
        assert AppSettings(root/'state', roots).read()['theme'] == 'dark'
        assert request('/api/settings', {**config, 'theme': 'invalid'})[0] == 400
        with urlopen(base+'/') as page:
            html = page.read().decode()
            assert 'data-theme-preference="dark"' in html and 'data-theme-canonical="true"' in html
        invalid = {**config, 'paths': {**config['paths'], 'claude:local': 'relative/path'}}
        assert request('/api/settings', invalid)[0] == 400
        assert request('/api/settings', config, Origin='https://outside.example')[0] == 403
        config['enabled']['claude:local'] = False
        assert request('/api/settings', config)[0] == 200
        assert request('/api/sessions')[1]['total'] == 0
        config['enabled']['claude:local'] = True
        assert request('/api/settings', config)[0] == 200
        store = server.store;key = 'claude:local:project/one'
        instruction = prompt(store, key, 'M/a', root/'state')['text']
        command = next(line for line in instruction.splitlines() if '--read-action outline' in line and line.startswith('/'))
        output = subprocess.check_output(shlex.split(command), text=True)
        restored = json.loads(output)
        assert restored['total'] == 2 and restored['through_ref'] == 'M/a'
        assert all(item['ref'] != 'M/u2' for item in restored['items'])
        assert read(store, key, 'message', 'M/u')['text'] == 'value=exact'
        assert hashlib.sha256(file.read_bytes()).hexdigest() == checksum
    finally:
        server.shutdown();server.server_close();worker.join()
print('settings and handoff self-test: ok (persistence, validation, origin, source switch, executable prompt, cutoff, exact values)')
