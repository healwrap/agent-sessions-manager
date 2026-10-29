import type { WorkspacePage } from '../workspace';
import { guideStore, useGuide, type GuideTopic } from '../state/guide-store';
import { accountGuide, proxyGuide } from '../lib/guide-links';
import { isGuideDemo } from '../lib/demo-mode';
import { Play } from 'lucide-react';
import { Button, ContentDialog, Disclosure, GuideLink } from './ui';

const demonstrations = [
  { topic: 'proxy', label: '代理配置' },
  { topic: 'account', label: '添加账号' },
  { topic: 'login', label: '登录账号' },
  { topic: 'switch', label: '切换账号' },
] as const;

export function GuideCenter({
  onNavigate,
}: {
  onNavigate: (page: WorkspacePage) => void;
}) {
  const { helpOpen, progress } = useGuide();
  if (!helpOpen) return null;
  const start = () => {
    guideStore.start('setup');
    onNavigate('accounts');
  };
  const resume = () => {
    guideStore.resume();
    onNavigate('accounts');
  };
  const demonstrate = (topic: GuideTopic = 'setup') => {
    if (isGuideDemo)
      guideStore.start(topic, 'demo-account-1', progress?.target);
    else guideStore.demonstrate(topic);
  };
  return (
    <ContentDialog
      title="帮助与引导"
      className="guide-center-dialog"
      onClose={guideStore.closeHelp}
      footer={
        <>
          {progress && (
            <Button variant="ghost" onClick={start}>
              重新开始
            </Button>
          )}
          {!isGuideDemo && (
            <Button variant="ghost" onClick={progress ? resume : start}>
              {progress ? '继续配置' : '开始配置'}
            </Button>
          )}
          <Button variant="primary" onClick={() => demonstrate()}>
            <Play size={15} />
            演示操作
          </Button>
        </>
      }
    >
      <GuideLink {...accountGuide} />
      <GuideLink href={proxyGuide.href} title={proxyGuide.title} />
      <div className="guide-sections">
        <Disclosure compact title="单项演示">
          <div className="ui-actions guide-shortcuts">
            {demonstrations.map(({ topic, label }) => (
              <Button
                key={topic}
                size="small"
                onClick={() => demonstrate(topic)}
              >
                {label}
              </Button>
            ))}
          </div>
        </Disclosure>
        <Disclosure compact title="使用提示">
          <p>邮件登录链接在对应账号的浏览器中打开。</p>
          <p>切号先停止环境，无需退出网站账号。</p>
          <p>修改代理前，先停止使用它的环境。</p>
        </Disclosure>
      </div>
    </ContentDialog>
  );
}
