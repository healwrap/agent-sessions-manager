import { useState } from 'react';
import { copyText } from '../lib/api';
import type { LocalApp } from '../lib/environment-settings';
import { Button } from './primitives';
import { isGuideDemo } from '../lib/demo-mode';

export function EnvironmentAppButton({ app }: { app: LocalApp }) {
  const [feedback, setFeedback] = useState('');
  const open = async () => {
    if (isGuideDemo) {
      setFeedback('这是示例应用，演示不会打开本机程序。');
      return;
    }
    try {
      if (window.__TAURI__?.core) {
        await window.__TAURI__.core.invoke('open_resource', {
          target: app.path,
          cwd: null,
          reveal: false,
        });
        setFeedback('已打开');
      } else {
        await copyText(app.path);
        setFeedback('已复制应用路径');
      }
    } catch (error) {
      setFeedback(String(error));
    }
  };
  return (
    <span className="environment-app-action">
      <Button onClick={() => void open()} title={app.path}>
        {window.__TAURI__?.core ? '打开' : '复制路径'} {app.name}
      </Button>
      {feedback && <span role="status">{feedback}</span>}
    </span>
  );
}
