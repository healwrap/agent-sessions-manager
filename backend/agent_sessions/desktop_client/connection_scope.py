"""Attribute connections to Claude components or independently launched tools."""
from pathlib import Path
import re
import psutil

VERSION = re.compile(r'\d+\.\d+\.\d+(?:-[A-Za-z0-9._-]+)?\Z')
HASH = re.compile(r'[a-f0-9]{8,64}\Z')


def node_entry(command):
    arguments = iter(command[1:])
    for argument in arguments:
        if argument in ('-e', '--eval', '-p', '--print') or argument.startswith(('--eval=', '--print=')): return ''
        if argument in ('-r', '--require', '--import', '--loader', '--experimental-loader', '-C', '--conditions'):
            next(arguments, None)
        elif argument == '--': return next(arguments, '')
        elif not argument.startswith('-'): return argument
    return ''


class ConnectionScope:
    def __init__(self, pid, executable, code_directory=None):
        self.pid = pid
        self.program = Path(executable).resolve() if executable else None
        self.app = next((path for path in self.program.parents if path.suffix.lower() == '.app'),
                        self.program.parent) if self.program else None
        self.code = Path(code_directory).resolve() if code_directory else None

    def code_program(self, program):
        if not self.code or not program.is_relative_to(self.code): return False
        parts = [part.casefold() for part in program.relative_to(self.code).parts]
        if not parts or not VERSION.fullmatch(parts.pop(0)): return False
        if parts and HASH.fullmatch(parts[0]): parts.pop(0)
        return parts in (['claude.app', 'contents', 'macos', 'claude'], ['claude'], ['claude.exe'])

    def classify(self, pid, executable, command):
        if pid == self.pid: return 'claude', '受管 Claude App 主进程'
        if not executable: return 'unknown', '无法读取可执行文件路径'
        program = Path(executable).resolve()
        if self.app and program.is_relative_to(self.app): return 'claude', 'Claude App 安装目录内的组件'
        if self.code_program(program): return 'claude', '受管环境下载的官方 Code 运行时'
        if program.name.lower() in ('node', 'node.exe'):
            if command is None: return 'unknown', '无法读取 Node 脚本入口'
            entry = node_entry(command)
            path = Path(entry.replace('\\', '/')) if entry else None
            if path and path.is_absolute(): path = path.resolve()
            if path and path.name in ('cli.js', 'cli.mjs') and path.parent.name in ('claude-code', 'claude-agent-sdk'):
                if path.parent.parent.name == '@anthropic-ai' and path.parent.parent.parent.name == 'node_modules':
                    return 'claude', '官方 Claude Code 脚本入口'
        return 'tool', '外部工具进程，连接仅记录'

    def describe(self, process):
        # A process may exec another program without changing its PID or creation time.
        # Use a fresh Process so cached executable information cannot retain an old role.
        current = psutil.Process(process.pid)
        result = {'pid': process.pid, 'process_name': '', 'executable': '', 'parent_pid': None,
                  'created_at': process.create_time(), 'process_scope': 'unknown', 'scope_reason': ''}
        command = None
        with current.oneshot():
            if current.create_time() != result['created_at']: return None
            for key, getter in [('process_name', current.name), ('executable', current.exe), ('parent_pid', current.ppid)]:
                try: result[key] = getter()
                except psutil.AccessDenied: pass
            try: command = current.cmdline()
            except psutil.AccessDenied: pass
        result['process_scope'], result['scope_reason'] = self.classify(process.pid, result['executable'], command)
        return result
