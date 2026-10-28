"""Observe an owned process tree; sampling is not an OS network filter."""
import ipaddress
import shutil
import subprocess
import sys
import psutil


class ConnectionViolation(ValueError):
    pass


def public(address):
    value = ipaddress.ip_address(address.split('%')[0])
    if value.version == 6 and value.ipv4_mapped: value = value.ipv4_mapped
    return not (value.is_loopback or value.is_private or value.is_link_local or value.is_unspecified)


class ProcessConnections:
    def __init__(self, pid):
        self.root = psutil.Process(pid)
        self.known = {pid: self.root}

    def processes(self):
        if self.root.is_running():
            try:
                for child in self.root.children(recursive=True): self.known[child.pid] = child
            except psutil.NoSuchProcess: pass
        found = []
        for proc in list(self.known.values()):
            try:
                if proc.is_running() and proc.status() != psutil.STATUS_ZOMBIE: found.append(proc)
            except psutil.NoSuchProcess: pass
        return found

    def sample(self):
        processes = self.processes()
        rows = []
        if sys.platform == 'darwin':
            lsof = shutil.which('lsof')
            if not lsof: raise ValueError('未找到 lsof，无法采样进程连接')
            if not processes: return rows
            result = subprocess.run([lsof, '-nP', '-a', '-p', ','.join(str(p.pid) for p in processes), '-i', '-FpnPT'],
                                    text=True, capture_output=True, timeout=5)
            if result.returncode not in (0, 1) or result.stderr.strip():
                raise ValueError('进程网络连接读取失败：'+result.stderr.strip())
            pid, protocol = 0, ''
            for line in result.stdout.splitlines():
                if line.startswith('p'): pid = int(line[1:])
                elif line.startswith('P'): protocol = line[1:]
                elif line.startswith('n') and '->' in line:
                    endpoint = line.split('->', 1)[1]
                    host, port = endpoint.rsplit(':', 1)
                    rows.append({'pid': pid, 'protocol': protocol, 'host': host.strip('[]'), 'port': int(port)})
        else:
            for proc in processes:
                try:
                    for connection in proc.net_connections(kind='inet'):
                        if connection.raddr:
                            rows.append({'pid': proc.pid, 'protocol': 'TCP' if connection.type == 1 else 'UDP',
                                         'host': connection.raddr.ip, 'port': connection.raddr.port})
                except psutil.NoSuchProcess: pass
        return rows

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
