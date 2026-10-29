import { useState, type KeyboardEvent } from 'react';
import { RotateCcw, X } from 'lucide-react';
import type { GuideTopic } from '../state/guide-store';
import { Button, IconButton, Select } from './ui';
import '../styles/guide-demo.css';

const scenes = [
  { value: 'setup', label: '首次配置', topic: 'setup', target: 'browser' },
  { value: 'proxy', label: '代理配置', topic: 'proxy', target: 'browser' },
  { value: 'account', label: '添加账号', topic: 'account', target: 'browser' },
  {
    value: 'login-browser',
    label: '浏览器登录',
    topic: 'login',
    target: 'browser',
  },
  { value: 'login-app', label: 'App 登录', topic: 'login', target: 'app' },
  {
    value: 'switch-browser',
    label: '浏览器切号',
    topic: 'switch',
    target: 'browser',
  },
  { value: 'switch-app', label: 'App 切号', topic: 'switch', target: 'app' },
];

export default function GuideDemoWorkspace({
  onClose,
  initialTopic = 'setup',
}: {
  onClose: () => void;
  initialTopic?: GuideTopic;
}) {
  const [scene, setScene] = useState(
    initialTopic === 'login' || initialTopic === 'switch'
      ? initialTopic + '-browser'
      : initialTopic,
  );
  const [revision, setRevision] = useState(0);
  const selected = scenes.find((item) => item.value === scene)!;
  const root = document.documentElement;
  const params = new URLSearchParams({
    topic: selected.topic,
    target: selected.target,
    theme: document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light',
    animations: String(!root.classList.contains('motion-off')),
    host: root.classList.contains('desktop-macos')
      ? 'macos'
      : root.classList.contains('desktop-host')
        ? 'desktop'
        : 'browser',
  });
  const escape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !event.defaultPrevented) onClose();
  };
  return (
    <section
      className="guide-demo-workspace"
      aria-label="演示工作区"
      onKeyDown={escape}
    >
      <iframe
        key={scene + revision}
        title="示例账号操作演示"
        src={'/guide-demo.html?' + params}
        sandbox="allow-scripts allow-same-origin allow-forms"
        referrerPolicy="no-referrer"
      />
      <div className="guide-demo-controls" aria-label="演示控制">
        <Select
          label="演示场景"
          value={scene}
          onChange={setScene}
          options={scenes}
        />
        <IconButton
          icon={<RotateCcw size={15} />}
          label="重新演示"
          onClick={() => setRevision((value) => value + 1)}
        />
        <Button size="small" variant="ghost" onClick={onClose}>
          <X size={15} />
          退出演示
        </Button>
      </div>
    </section>
  );
}
