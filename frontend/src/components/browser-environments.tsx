import {
  Fingerprint,
  Globe2,
  PanelsTopLeft,
  Pencil,
  Plus,
  Play,
  Square,
  Trash2,
} from 'lucide-react';
import type {
  BrowserProfile,
  EnvironmentSettings,
} from '../lib/environment-settings';
import { AgentIcon } from './agent-icon';
import { BrowserLaunchReport } from './browser-launch-report';
import { runLabels } from '../lib/environment-settings';
import { Button } from './primitives';

export function BrowserEnvironments({
  data,
  busy,
  loading,
  onEdit,
  onDelete,
  onRuntime,
}: {
  data: EnvironmentSettings;
  busy: boolean;
  loading: boolean;
  onEdit: (item?: BrowserProfile) => void;
  onDelete: (id: string) => void;
  onRuntime: (action: 'start' | 'stop', body: { profile_id: string }) => void;
}) {
  const kernel = data.browser.kernel;
  return (
    <>
      <div className="environment-connection">
        <span className="environment-small-icon">
          <PanelsTopLeft size={19} />
        </span>
        <div>
          <strong>Fingerprint Chromium</strong>
          <p>
            {loading
              ? '正在读取本机内核…'
              : kernel.available
                ? `${kernel.version} · 来自 ${kernel.source}`
                : '尚未找到支持指纹的 Chromium 内核'}
          </p>
        </div>
        <span className="environment-tag">
          {kernel.available ? '内核已就绪' : '未安装'}
        </span>
      </div>
      <section className="environment-panel" aria-label="浏览器环境列表">
        <header className="environment-panel-heading">
          <h2>
            环境配置 <span>{data.profiles.length}</span>
          </h2>
          <span className="environment-muted">Claude / Codex</span>
        </header>
        <div className="environment-table-wrap">
          <table className="environment-table">
            <thead>
              <tr>
                <th>环境 / Agent</th>
                <th>浏览器与代理</th>
                <th>语言 / 时区</th>
                <th>状态</th>
                <th>
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.profiles.map((item) => {
                const run = data.browser.runs.find(
                  (row) => row.profile_id === item.id,
                );
                const live = run?.alive || run?.status === 'checking';
                return (
                  <tr key={item.id}>
                    <td>
                      <span className="environment-name">
                        <AgentIcon source={item.provider} />
                        <strong>{item.name}</strong>
                      </span>
                      <small>
                        {item.provider === 'codex' ? 'Codex' : 'Claude'}
                      </small>
                    </td>
                    <td>
                      {item.engine === 'chrome'
                        ? 'Google Chrome（需更换内核）'
                        : 'Fingerprint Chromium'}
                      <small>
                        {data.proxies.find(
                          (proxy) => proxy.id === item.proxy_id,
                        )?.name || '系统出口'}
                      </small>
                    </td>
                    <td>
                      {item.locale_mode === 'proxy'
                        ? '语言跟随出口'
                        : item.locale}
                      <small>
                        {item.timezone_mode === 'proxy'
                          ? '时区跟随出口'
                          : item.timezone}
                      </small>
                    </td>
                    <td>
                      <span className="environment-tag">
                        {run ? runLabels[run.status] : '尚未启动'}
                      </span>
                    </td>
                    <td>
                      <div className="environment-row-actions">
                        <Button
                          disabled={busy || !kernel.available}
                          onClick={() =>
                            onRuntime(live ? 'stop' : 'start', {
                              profile_id: item.id,
                            })
                          }
                        >
                          {live ? <Square size={14} /> : <Play size={14} />}
                          {live ? '停止' : '启动'}
                        </Button>
                        <button
                          aria-label={`编辑环境 ${item.name}`}
                          onClick={() => onEdit(item)}
                          disabled={busy || live}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          aria-label={`删除环境配置 ${item.name}`}
                          onClick={() => onDelete(item.id)}
                          disabled={busy || live}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!data.profiles.length && (
          <div className="environment-empty">
            <span className="environment-empty-icon">
              <PanelsTopLeft size={30} strokeWidth={1.3} />
            </span>
            <h3>{loading ? '正在读取环境配置…' : '创建第一个浏览器环境'}</h3>
            <p>为不同 Agent 和账号，分别设置浏览器、代理、语言与时区。</p>
            <Button onClick={() => onEdit()} disabled={loading || busy}>
              <Plus size={15} />
              新建环境配置
            </Button>
          </div>
        )}
        <footer className="environment-panel-note">
          <Fingerprint size={14} />
          每个环境独立保存登录状态与指纹种子，通过启动门控后放行网站访问。
        </footer>
      </section>
      {data.browser.runs
        .filter((run) => !run.account_id)
        .map((run) => (
          <BrowserLaunchReport key={run.profile_id} run={run} />
        ))}
      <div className="environment-capabilities">
        <div>
          <Globe2 size={17} />
          <strong>语言与时区</strong>
          <span>按环境独立设置</span>
        </div>
        <div>
          <Fingerprint size={17} />
          <strong>稳定指纹</strong>
          <span>每个环境固定种子</span>
        </div>
        <div>
          <PanelsTopLeft size={17} />
          <strong>登录状态</strong>
          <span>按环境隔离保存</span>
        </div>
      </div>
    </>
  );
}
