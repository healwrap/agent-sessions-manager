import { createRoot } from 'react-dom/client';
import { useEffect } from 'react';
import { AccountWorkspace } from './components/account-workspace';
import { GuideCenter } from './components/guide-center';
import { useSessionStore } from './hooks/use-session-store';
import { guideStore, guideTopics, type GuideTopic } from './state/guide-store';
import { sessionStore } from './state/session-store';
import { applyTheme } from './lib/theme';
import { demoStorage } from './demo/storage';
import './styles/index.css';

// Demo storage belongs to this frame, never to the application origin.
Object.defineProperty(window, 'localStorage', { value: demoStorage() });
Object.defineProperty(window, 'sessionStorage', { value: demoStorage() });
const params = new URLSearchParams(location.search);
const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
const animations = params.get('animations') !== 'false';
applyTheme(theme, false);
document.documentElement.classList.toggle('motion-off', !animations);
sessionStore.update({
  settings: { ...sessionStore.state.settings, theme, animations },
});
const topic = params.get('topic') || 'setup';
guideStore.start(
  Object.hasOwn(guideTopics, topic) ? (topic as GuideTopic) : 'setup',
  'demo-account-1',
  params.get('target') === 'app' ? 'app' : 'browser',
);

function explainLink(event: MouseEvent) {
  if ((event.target as Element).closest('a[href]')) {
    event.preventDefault();
    event.stopPropagation();
    sessionStore.notify('资料链接请退出演示后打开。');
  }
}
document.addEventListener('click', explainLink, true);
document.addEventListener('auxclick', explainLink, true);

function DemoApp() {
  const state = useSessionStore();
  useEffect(() => {
    if (!state.settingsOpen) return;
    sessionStore.update({ settingsOpen: false });
    sessionStore.notify('系统设置与组件管理请退出演示后操作。');
  }, [state.settingsOpen]);
  return (
    <>
      <AccountWorkspace
        onNavigate={() => sessionStore.notify('演示包含账号、环境与代理操作。')}
      />
      <GuideCenter onNavigate={() => {}} />
      {state.toast && (
        <div id="toast" role="status">
          {state.toast}
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById('root')!).render(<DemoApp />);
