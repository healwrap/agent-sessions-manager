"""Retain run metadata and identify surviving processes by their exact data directory."""
import json
import os
from pathlib import Path
import signal
import subprocess
import threading
import time
from .gates import blocked


class OwnedProcess:
    def __init__(self, pid, executable, directory):
        self.pid, self.executable, self.directory = pid, executable, str(directory)
        self.returncode = None

    def poll(self):
        if self.returncode is not None: return self.returncode
        result = subprocess.run(['ps', '-p', str(self.pid), '-o', 'args='], capture_output=True, text=True, timeout=3)
        command = result.stdout.strip()
        marker = '--user-data-dir='+self.directory
        owned = bool(self.executable and command.startswith(self.executable+' ') and
                     (marker+' ' in command or command.endswith(marker)))
        if not owned: self.returncode = 0
        return self.returncode

    def terminate(self):
        if self.poll() is None: os.kill(self.pid, signal.SIGTERM)

    def kill(self):
        if self.poll() is None: os.kill(self.pid, signal.SIGKILL)

    def wait(self, timeout):
        deadline = time.monotonic()+timeout
        while self.poll() is None:
            if time.monotonic() >= deadline: raise subprocess.TimeoutExpired('owned browser', timeout)
            time.sleep(.1)
        return self.returncode


class ProcessState:
    def __init__(self, directory):
        self.path = Path(directory)/'runtime.json'
        self.lock, self.previous = threading.RLock(), ''

    def restore(self, profiles, directory_for, executable_for):
        if not self.path.exists(): return {}, {}
        value = json.loads(self.path.read_text())
        runs, processes = {}, {}
        for profile in profiles:
            key = profile['id']
            if key not in value: continue
            run = dict(value[key])
            process = OwnedProcess(run.get('pid', 0), executable_for(profile), directory_for(key))
            alive = bool(process.pid and process.poll() is None)
            if alive:
                processes[key] = process
                run.update(status='interrupted', stage='检测到上次遗留的窗口',
                           error='管理器曾意外中断；点击打开会先关闭这个环境的旧进程，再恢复专用代理与账号页面')
            elif run['status'] == 'checking':
                run.update(status='interrupted', stage='上次启动已中断', error='管理器在启动检查完成前退出，请重新打开环境')
            elif run['status'] in ('running', 'interrupted'):
                run.update(status='stopped', stage='上次运行已结束', error='')
            if not alive and run['status'] in ('stopped', 'blocked') and blocked(run.get('checks', [])):
                run.update(status='blocked', stage='上次启动检查未通过，环境已拦截')
            runs[key] = run
        return runs, processes

    def save(self, runs):
        fields = ('profile_id', 'account_id', 'name', 'status', 'stage', 'checked_at', 'checks',
                  'resolved', 'browser_checks', 'error', 'engine', 'pid', 'data_directory')
        value = {key: {field: row[field] for field in fields if field in row} for key, row in runs.items()}
        content = json.dumps(value, ensure_ascii=False, indent=2)
        with self.lock:
            if content == self.previous: return
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix('.tmp')
            temporary.write_text(content)
            temporary.chmod(0o600)
            temporary.replace(self.path)
            self.previous = content
