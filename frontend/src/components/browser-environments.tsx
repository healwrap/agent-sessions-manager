import {
  Fingerprint,
  Globe2,
  PanelsTopLeft,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import type {
  BrowserProfile,
  EnvironmentSettings,
} from '../lib/environment-settings';
import { AgentIcon } from './agent-icon';
import { EnvironmentAppButton } from './environment-app-button';
import { Button } from './primitives';

export function BrowserEnvironments({
  data,
  busy,
  loading,
  onEdit,
  onDelete,
}: {
  data: EnvironmentSettings;
  busy: boolean;
  loading: boolean;
  onEdit: (item?: BrowserProfile) => void;
  onDelete: (id: string) => void;
}) {
  const managers = data.apps.filter((app) => app.id.startsWith('ccbaga'));
  return (
    <>
      <div className="environment-connection">
        <span className="environment-small-icon">
          <PanelsTopLeft size={19} />
        </span>
        <div>
          <strong>浏览器连接</strong>
          <p>
            {loading
              ? '正在读取本机应用…'
              : managers.length
                ? `已发现 ${managers.map((app) => app.name).join('、')}`
                : '尚未发现 CCBaga'}
          </p>
        </div>
        <span className="environment-tag">
          {managers.length ? '外部管理器' : '未连接'}
        </span>
        <div className="environment-app-buttons">
          {managers.map((app) => (
            <EnvironmentAppButton key={app.id} app={app} />
          ))}
        </div>
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
              {data.profiles.map((item) => (
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
                    {item.engine === 'ccbaga' ? 'CCBaga' : 'Google Chrome'}
                    <small>
                      {data.proxies.find((proxy) => proxy.id === item.proxy_id)
                        ?.name || '系统出口'}
                    </small>
                  </td>
                  <td>
                    {item.locale}
                    <small>{item.timezone}</small>
                  </td>
                  <td>
                    <span className="environment-tag">配置草稿</span>
                  </td>
                  <td>
                    <div className="environment-row-actions">
                      <button
                        aria-label={`编辑环境 ${item.name}`}
                        onClick={() => onEdit(item)}
                        disabled={busy}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        aria-label={`删除环境配置 ${item.name}`}
                        onClick={() => onDelete(item.id)}
                        disabled={busy}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
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
          配置草稿已独立保存；浏览器运行、登录状态与指纹应用待接入。
        </footer>
      </section>
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
          <span>后续按环境隔离保存</span>
        </div>
      </div>
    </>
  );
}
