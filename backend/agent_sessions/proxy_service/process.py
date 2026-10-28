"""Own only the exact executable and configuration launched for a proxy entry."""
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import time


def private_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_suffix('.tmp')
    with open(temporary, 'w', opener=lambda name, flags: os.open(name, flags, 0o600)) as output:
        json.dump(value, output, ensure_ascii=False, indent=2)
    temporary.chmod(0o600)
    temporary.replace(path)


def listening(port):
    with socket.socket() as connection:
        connection.settimeout(.15)
        return connection.connect_ex(('127.0.0.1', port)) == 0


def free_port():
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        return listener.getsockname()[1]


class ProxyProcess:
    def __init__(self, directory, executable):
        self.directory, self.executable = Path(directory), str(executable)
        self.command = [self.executable, '-d', str(self.directory), '-f', str(self.directory/'config.json')]
        self.process, self.pid = None, None
        try:
            value = json.loads((self.directory/'process.json').read_text())
            self.pid = value['pid']
        except (OSError, ValueError, KeyError): pass
        if not self.alive(): self.pid = None

    def alive(self):
        if self.process: return self.process.poll() is None
        if type(self.pid) is not int or self.pid <= 1: return False
        result = subprocess.run(['ps', '-p', str(self.pid), '-o', 'command='], capture_output=True, text=True)
        return result.returncode == 0 and result.stdout.strip() == ' '.join(self.command)

    def start(self, port):
        if self.alive():
            if listening(port): return
            self.stop()
        if listening(port): raise ValueError(f'本机端口 {port} 已被其他程序占用，请先停止占用程序')
        log = self.directory/'core.log'
        # Limit retained logs between launches; live output stays in the entry directory.
        if log.exists() and log.stat().st_size > 2_000_000: log.replace(log.with_suffix('.previous.log'))
        with open(log, 'ab', opener=lambda name, flags: os.open(name, flags, 0o600)) as output:
            self.process = subprocess.Popen(self.command, stdin=subprocess.DEVNULL, stdout=output,
                                            stderr=subprocess.STDOUT, start_new_session=True)
        self.pid = self.process.pid
        private_json(self.directory/'process.json', {'pid': self.pid})
        for _ in range(50):
            if not self.alive(): break
            if listening(port): return
            time.sleep(.1)
        self.stop()
        raise ValueError('代理内核未能启动，请查看 '+str(log))

    def stop(self):
        if self.alive():
            os.kill(self.pid, signal.SIGTERM)
            for _ in range(30):
                if not self.alive(): break
                time.sleep(.1)
            if self.alive(): os.kill(self.pid, signal.SIGKILL)
        if self.process:
            self.process.wait(timeout=3)
        self.pid, self.process = None, None
        (self.directory/'process.json').unlink(missing_ok=True)
