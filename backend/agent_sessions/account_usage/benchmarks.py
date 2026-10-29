"""Refresh a public benchmark without sending account identity or credentials."""
import json
from pathlib import Path
import shutil
import subprocess
import threading
import time
from urllib.parse import urlsplit
from urllib.request import getproxies, proxy_bypass
from .benchmark_data import DATA_URL, DATA_VERSION, PLAN_BASIS, PLAN_RATIOS, normalize_benchmarks

REFRESH_INTERVAL = 6*3600


class QuotaBenchmarks:
    def __init__(self, directory):
        self.path = Path(directory)/'quota-benchmarks.json'
        self.lock, self.closed = threading.RLock(), False
        seed = json.loads(Path(__file__).with_name('benchmark_seed.json').read_text(encoding='utf-8'))
        try: saved = json.loads(self.path.read_text(encoding='utf-8')) if self.path.exists() else {}
        except (OSError, ValueError): saved = {}
        self.data = saved.get('data') or seed
        self.fetched_at = saved.get('fetched_at', 0)
        self.next_refresh = self.fetched_at+REFRESH_INTERVAL if self.data.get('adapter_version') == DATA_VERSION else 0
        self.refreshing, self.error = False, ''

    def read(self):
        with self.lock:
            return {**self.data, 'plan_ratios': PLAN_RATIOS.copy(), 'plan_basis': PLAN_BASIS.copy(),
                    'fetched_at': self.fetched_at or None,
                    'refreshing': self.refreshing, 'error': self.error,
                    'next_refresh_at': self.next_refresh,
                    'stale': self.data.get('adapter_version') != DATA_VERSION or time.time()-self.fetched_at >= REFRESH_INTERVAL}

    def refresh(self, value=None, *, automatic=False):
        value = {} if value is None else value
        if value != {}:
            raise ValueError('数据源参数无效')
        with self.lock:
            if self.closed or self.refreshing: return self.read()
            if automatic and time.time() < self.next_refresh: return self.read()
            if not automatic and time.time()-self.fetched_at < 60: return self.read()
            self.refreshing, self.error = True, ''
            threading.Thread(target=self._fetch, daemon=True).start()
            return self.read()

    def _fetch(self):
        try:
            curl = shutil.which('curl')
            if not curl: raise ValueError('没有找到 curl，无法同步估算数据')
            settings = getproxies()
            url = '' if proxy_bypass(urlsplit(DATA_URL).hostname) else settings.get('https') or settings.get('all') or ''
            config = 'proxy = "'+url.replace('\\', '\\\\').replace('"', '\\"')+'"\n'
            run = subprocess.run([curl, '-q', '--config', '-', '--fail', '--silent', '--show-error',
                                  '--compressed', '--proto', '=https', '--connect-timeout', '8',
                                  '--max-time', '35', '--max-filesize', '4194304',
                                  '--noproxy', '' if url else '*', '--user-agent', 'Agent-Sessions-Quota/1.0', DATA_URL],
                                 input=config, text=True, capture_output=True, timeout=40)
            if run.returncode: raise ValueError('同步第三方估算数据失败：'+run.stderr.strip())
            data = normalize_benchmarks(json.loads(run.stdout))
            with self.lock:
                if self.closed: return
                self.data, self.fetched_at = data, time.time()
                self.next_refresh = self.fetched_at+REFRESH_INTERVAL
                self.path.parent.mkdir(parents=True, exist_ok=True)
                temporary = self.path.with_suffix('.tmp')
                temporary.write_text(json.dumps({'data': data, 'fetched_at': self.fetched_at}, ensure_ascii=False), encoding='utf-8')
                temporary.replace(self.path)
        except (OSError, ValueError, TypeError, AttributeError, KeyError, subprocess.TimeoutExpired) as error:
            with self.lock:
                self.error = str(error)
                self.next_refresh = time.time()+300
        finally:
            with self.lock: self.refreshing = False

    def close(self):
        with self.lock: self.closed = True
