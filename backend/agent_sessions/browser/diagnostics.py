"""Open a fresh probe in the managed profile after its launch gates pass."""
import subprocess
import threading
import time
from . import kernel


def start(runtime, value):
    if not isinstance(value, dict) or set(value) != {'profile_id'}:
        raise ValueError('请选择已保存的浏览器环境')
    key = value['profile_id']
    settings = runtime.environments.read()
    profile = next((row for row in settings['profiles'] if row['id'] == key), None)
    if not profile: raise ValueError('此浏览器环境已不存在，请重新选择')
    with runtime.lock:
        previous = runtime.inspections.get(key)
        if previous:
            try:
                ticket = runtime.diagnostics.read(previous)
                if ticket['state'] == 'waiting': return ticket
            except ValueError: pass
        process = runtime.processes.get(key)
        run = runtime.runs.get(key, {})
        if run.get('status') != 'checking' and not (process and process.poll() is None):
            runtime.launch(value)
            run = runtime.runs[key]
        ticket = runtime.diagnostics.start({'target': 'profile:'+key})
        runtime.inspections[key] = ticket['token']
        threading.Thread(target=_open, args=(runtime, key, run, ticket['token']), daemon=True).start()
        return ticket


def _open(runtime, key, run, token):
    try:
        deadline = time.monotonic()+240
        while run.get('status') == 'checking' and time.monotonic() < deadline:
            if run.get('cancelled'): raise ValueError('环境已停止，请重新打开环境检测')
            time.sleep(.3)
        with runtime.lock:
            if run.get('status') != 'running' or run.get('cancelled'):
                failures = [row['title']+'：'+row['value']+('（'+row['detail']+'）' if row['detail'] else '') for row in run.get('checks', [])
                            if row['policy'] == 'block' and row['state'] not in ('pass', 'skip')]
                raise ValueError(run.get('error') or '环境尚未通过启动检查'+('；'+'；'.join(failures) if failures else ''))
            process = runtime.processes.get(key)
            if not process or process.poll() is not None: raise ValueError('目标浏览器已关闭，请重新检测')
            runtime.diagnostics.set_expected(token, {field: run['resolved'][field] for field in ('locale', 'timezone')})
            found = kernel.discover(runtime.directory/'kernel')
            url = runtime.origin+'/browser-check.html?ticket='+token
            # Chromium forwards the URL to the existing process for this exact data directory.
            # The running process keeps its proxy, fingerprint, language and time zone.
            result = subprocess.run([found['path'], '--user-data-dir='+str(runtime.profile_directory(key)), url],
                                    stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
            if result.returncode: raise ValueError(f'未能在目标浏览器打开检测页，退出码 {result.returncode}')
        while time.monotonic() < deadline:
            if runtime.diagnostics.read(token)['state'] != 'waiting': return
            if run.get('cancelled') or process.poll() is not None:
                raise ValueError('采样完成前目标浏览器已关闭，请重新检测')
            time.sleep(.3)
        raise ValueError('目标浏览器未在 240 秒内回传，请检查该环境窗口后重新检测')
    except Exception as error:
        runtime.diagnostics.fail(token, str(error))
