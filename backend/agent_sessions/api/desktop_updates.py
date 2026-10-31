"""Freeze new account launches only while an idle desktop installation is replaced."""
class DesktopUpdateGuard:
    def __init__(self, browser, app, components):
        self.browser, self.app, self.components = browser, app, components
        self.pending = False

    def ready(self, component):
        # Runtime launchers also call this inside their process lock.
        if self.pending: raise ValueError('正在安装应用更新，请稍候')
        self.components.ready(component)

    def command(self, action, value):
        if not isinstance(value, dict) or value: raise ValueError('应用更新参数无效')
        with self.browser.lock, self.app.lock:
            if action == 'cancel':
                self.pending = False
                return {'ready': False}
            if action != 'prepare': raise ValueError('应用更新操作无效')
            for runtime in (self.browser, self.app):
                if (any(run.get('status') == 'checking' for run in runtime.runs.values())
                        or any(process.poll() is None for process in runtime.processes.values())):
                    raise ValueError('请先停止运行中的账号环境，再安装更新；登录状态会保留')
            self.pending = True
            return {'ready': True}
