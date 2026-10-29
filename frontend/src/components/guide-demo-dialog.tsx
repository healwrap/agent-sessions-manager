import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { guideTopics, type GuideTopic } from '../state/guide-store';
import { Button, ContentDialog, Select } from './ui';
import '../styles/guide-demo.css';

export default function GuideDemoDialog({
  onClose,
  initialTopic = 'setup',
}: {
  onClose: () => void;
  initialTopic?: GuideTopic;
}) {
  const [topic, setTopic] = useState<GuideTopic>(initialTopic);
  const [target, setTarget] = useState('browser');
  const [revision, setRevision] = useState(0);
  const theme = document.body.hasAttribute('data-ds-dark-theme')
    ? 'dark'
    : 'light';
  const animations = !document.documentElement.classList.contains('motion-off');
  const params = new URLSearchParams({
    topic,
    target,
    theme,
    animations: String(animations),
  });
  return (
    <ContentDialog
      title="演示模式"
      description="所有操作只使用示例数据，退出后清空。"
      className="guide-demo-dialog"
      onClose={onClose}
      footer={
        <>
          <div className="guide-demo-scenarios">
            <Select
              label="演示场景"
              value={topic}
              onChange={(value) => setTopic(value as GuideTopic)}
              options={Object.entries(guideTopics).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            {(topic === 'login' || topic === 'switch') && (
              <Select
                label="演示使用方式"
                value={target}
                onChange={setTarget}
                options={[
                  { value: 'browser', label: '浏览器' },
                  { value: 'app', label: 'Claude App' },
                ]}
              />
            )}
          </div>
          <Button onClick={() => setRevision((value) => value + 1)}>
            <RotateCcw size={15} />
            重新演示
          </Button>
          <Button variant="primary" onClick={onClose}>
            退出演示
          </Button>
        </>
      }
    >
      <iframe
        key={topic + target + revision}
        title="示例账号操作演示"
        src={'/guide-demo.html?' + params}
        sandbox="allow-scripts allow-same-origin allow-forms"
        referrerPolicy="no-referrer"
      />
    </ContentDialog>
  );
}
