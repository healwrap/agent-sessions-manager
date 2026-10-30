"""Observe an owned process tree; sampling is not an OS network filter."""
import ipaddress
import shutil
import subprocess
import sys
import psutil
from .connection_scope import ConnectionScope

SAMPLE_INTERVAL = .25


class ConnectionViolation(ValueError):
    pass


def public(address):
    value = ipaddress.ip_address(address.split('%')[0])
    if value.version == 6 and value.ipv4_mapped: value = value.ipv4_mapped
    return not (value.is_loopback or value.is_private or value.is_link_local or value.is_unspecified)


class ProcessConnections:
    def __init__(self, pid, executable=None, code_directory=None):
        self.root = psutil.Process(pid)
        self.known = {pid: self.root}
        self.scope = ConnectionScope(pid, executable or self.root.exe(), code_directory)

    def processes(self):
        if self.root.is_running():
            try:
                for child in self.root.children(recursive=True): self.known[child.pid] = child
            except psutil.NoSuchProcess: pass
        found = []
        for proc in list(self.known.values()):
            try:
                if proc.is_running() and proc.status() != psutil.STATUS_ZOMBIE:
                    found.append(proc)
                    continue
            except psutil.NoSuchProcess: pass
            self.known.pop(proc.pid, None)
        return found

    def sample(self):
        processes = self.processes()
        identities = {}
        for process in processes:
            try:
                identity = self.scope.describe(process)
                if identity: identities[process.pid] = identity
            except psutil.NoSuchProcess: pass
        rows = []
        if sys.platform == 'darwin':
            lsof = shutil.which('lsof')
            if not lsof: raise ValueError('未找到 lsof，无法采样进程连接')
            if not processes: return rows
            result = subprocess.run([lsof, '-nP', '-a', '-p', ','.join(str(p.pid) for p in processes), '-i', '-FpcfnPT'],
                                    text=True, capture_output=True, timeout=1)
            if result.returncode not in (0, 1) or result.stderr.strip():
                raise ValueError('进程网络连接读取失败：'+result.stderr.strip())
            pid, protocol, pending = 0, '', None
            for line in result.stdout.splitlines():
                if line.startswith(('p', 'f')):
                    if pending: rows.append(pending)
                    pending, protocol = None, ''
                    if line.startswith('p'): pid = int(line[1:])
                elif line.startswith('P'): protocol = line[1:]
                elif line.startswith('n') and '->' in line:
                    endpoint = line.split('->', 1)[1]
                    host, port = endpoint.rsplit(':', 1)
                    pending = {'pid': pid, 'protocol': protocol, 'host': host.strip('[]'), 'port': int(port), 'state': ''}
                elif line.startswith('TST=') and pending: pending['state'] = line[4:]
            if pending: rows.append(pending)
        else:
            for proc in processes:
                try:
                    for connection in proc.net_connections(kind='inet'):
                        if connection.raddr:
                            rows.append({'pid': proc.pid, 'protocol': 'TCP' if connection.type == 1 else 'UDP',
                                         'host': connection.raddr.ip, 'port': connection.raddr.port, 'state': connection.status})
                except psutil.NoSuchProcess: pass
        # Re-check process identity after the OS query to avoid attributing a reused PID.
        alive = {process.pid for process in processes if process.is_running()}
        return [{**row, **identities[row['pid']]} for row in rows if row['pid'] in identities and row['pid'] in alive]

    def finish(self):
        children = [proc for proc in self.processes() if proc.pid != self.root.pid]
        _, alive = psutil.wait_procs(children, timeout=2)
        for proc in alive:
            try: proc.terminate()
            except psutil.NoSuchProcess: pass
        _, alive = psutil.wait_procs(alive, timeout=2)
        for proc in alive:
            try: proc.kill()
            except psutil.NoSuchProcess: pass
