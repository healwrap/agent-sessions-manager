import { copyText } from '../lib/api';
import type { LocalApp } from '../lib/environment-settings';
import { Button } from './primitives';
import { isGuideDemo } from '../lib/demo-mode';
import { toast } from './ui/toast';

export function EnvironmentAppButton({ app }: { app: LocalApp }) {
  const open = async () => {
    if (isGuideDemo) {
      toast('这是示例应用，演示不会打开本机程序。');
      return;
    }
    try {
      if (window.__TAURI__?.core) {
        await window.__TAURI__.core.invoke('open_resource', {
          target: app.path,
          cwd: null,
          reveal: false,
        });
        toast('已打开 ' + app.name, { tone: 'success' });
      } else {
        await copyText(app.path);
        toast('已复制应用路径', { tone: 'success' });
      }
    } catch (error) {
      toast(String(error), { tone: 'error' });
    }
  };
  return (
    <span className="environment-app-action">
      <Button onClick={() => void open()} title={app.path}>
        {window.__TAURI__?.core ? '打开' : '复制路径'} {app.name}
      </Button>
    </span>
  );
}
