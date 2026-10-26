import {
  ArrowRight,
  Cable,
  Monitor,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import type { EnvironmentSettings } from '../lib/environment-settings';
import { AgentIcon } from './agent-icon';
import { EnvironmentAppButton } from './environment-app-button';
import { Button } from './primitives';

export function AppAccounts({
  data,
  loading,
  onInspect,
}: {
  data: EnvironmentSettings;
  loading: boolean;
  onInspect: () => void;
}) {
  const claude = data.apps.find((app) => app.id === 'claude');
  const switcher = data.apps.find((app) => app.id === 'switcher');
  return (
    <>
      <section className="environment-connection environment-native-app">
        <span className="environment-small-icon">
          <AgentIcon source="claude" />
        </span>
        <div>
          <strong>Claude App</strong>
          <p>
            {loading
              ? '正在读取本机应用…'
              : claude?.path || '尚未发现 Claude App'}
          </p>
        </div>
        <span
          className="environment-tag"
          data-tone={claude ? 'ready' : undefined}
        >
          {claude ? '已安装' : loading ? '读取中' : '未发现'}
        </span>
        {claude && <EnvironmentAppButton app={claude} />}
      </section>
      <div className="environment-two-column">
        <section className="environment-panel environment-feature-panel">
          <UsersRound size={23} strokeWidth={1.5} />
          <h2>Claude App 账号切换</h2>
          <p>通过本机已有的 Claude 切换器，管理账号登录与切换。</p>
          <dl className="environment-detail-list">
            <div>
              <dt>现有切换器</dt>
              <dd>{switcher ? '已发现' : loading ? '正在检查' : '未发现'}</dd>
            </div>
            <div>
              <dt>页面内账号列表</dt>
              <dd>待接入</dd>
            </div>
            <div>
              <dt>登录状态备份</dt>
              <dd>由现有切换器管理</dd>
            </div>
          </dl>
          {switcher ? (
            <EnvironmentAppButton app={switcher} />
          ) : (
            <span className="environment-muted">
              安装现有切换器后可从这里打开。
            </span>
          )}
        </section>
        <section className="environment-panel environment-feature-panel">
          <Cable size={23} strokeWidth={1.5} />
          <h2>App 独立环境</h2>
          <p>围绕 Claude App 分别管理网络与区域配置。</p>
          <dl className="environment-detail-list">
            <div>
              <dt>专用代理</dt>
              <dd>待绑定 App</dd>
            </div>
            <div>
              <dt>语言与时区</dt>
              <dd>待接入独立设置</dd>
            </div>
            <div>
              <dt>CC Switch / CLI 配置</dt>
              <dd>各自独立</dd>
            </div>
          </dl>
          <span className="environment-tag">App 环境配置待接入</span>
        </section>
      </div>
      <section className="environment-next-step">
        <ShieldCheck size={20} />
        <div>
          <strong>查看 Claude App 的实际配置</strong>
          <p>读取安装版本、App 进程与配置继承情况。</p>
        </div>
        <Button variant="text" onClick={onInspect}>
          检查 App 环境
          <ArrowRight size={15} />
        </Button>
      </section>
      <p className="environment-footnote">
        <Monitor size={14} />
        当前提供本机应用入口；此页面尚未读取或切换 Claude App 的登录状态。
      </p>
    </>
  );
}
