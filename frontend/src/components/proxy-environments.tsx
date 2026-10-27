import { Globe2, Network, Pencil, Plus, ScanLine, Trash2 } from 'lucide-react';
import type {
  EnvironmentSettings,
  ProxyConfig,
} from '../lib/environment-settings';
import { Button, IconButton } from './primitives';
import { StatusBadge } from './form-controls';

export function ProxyEnvironments({
  data,
  loading,
  busy,
  onEdit,
  onDelete,
  onInspect,
}: {
  data: EnvironmentSettings;
  loading: boolean;
  busy: boolean;
  onEdit: (item?: ProxyConfig) => void;
  onDelete: (id: string) => void;
  onInspect: (proxy: string) => void;
}) {
  return (
    <>
      <section className="environment-route-strip">
        <span className="environment-small-icon">
          <Network size={20} />
        </span>
        <div>
          <strong>按环境分配代理</strong>
          <p>配置可供浏览器环境引用；代理检测使用所选地址发起请求。</p>
        </div>
        <StatusBadge>按环境生效</StatusBadge>
      </section>
      <section className="environment-panel" aria-label="代理配置列表">
        <header className="environment-panel-heading">
          <h2>
            代理配置 <span>{data.proxies.length}</span>
          </h2>
          <span className="environment-muted">HTTP / HTTPS / SOCKS5</span>
        </header>
        <div className="environment-table-wrap">
          <table className="environment-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>代理地址</th>
                <th>环境引用</th>
                <th>
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.proxies.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className="environment-name">
                      <Globe2 size={17} />
                      <strong>{item.name}</strong>
                    </span>
                  </td>
                  <td className="environment-proxy-url">{item.url}</td>
                  <td>
                    {data.profiles.filter(
                      (profile) => profile.proxy_id === item.id,
                    ).length +
                      data.app_profiles.filter(
                        (profile) => profile.proxy_id === item.id,
                      ).length}{' '}
                    个配置
                  </td>
                  <td>
                    <div className="environment-row-actions">
                      <Button
                        size="small"
                        variant="text"
                        aria-label={`检测代理 ${item.name}`}
                        onClick={() => onInspect(item.url)}
                      >
                        <ScanLine size={16} />
                        <span>检测</span>
                      </Button>
                      <IconButton
                        label={`编辑代理 ${item.name}`}
                        icon={<Pencil size={15} />}
                        onClick={() => onEdit(item)}
                        disabled={busy}
                      />
                      <IconButton
                        label={`删除代理配置 ${item.name}`}
                        icon={<Trash2 size={15} />}
                        onClick={() => onDelete(item.id)}
                        disabled={busy}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.proxies.length && (
          <div className="environment-empty">
            <span className="environment-empty-icon">
              <Globe2 size={30} strokeWidth={1.3} />
            </span>
            <h3>{loading ? '正在读取代理配置…' : '添加专用代理'}</h3>
            <p>保存常用代理，再为每个浏览器环境选择对应出口。</p>
            <Button onClick={() => onEdit()} disabled={loading || busy}>
              <Plus size={15} />
              添加代理配置
            </Button>
          </div>
        )}
        <footer className="environment-panel-note">
          <Network size={14} />
          浏览器和 App 各自使用绑定代理；引用数量包含两种环境。
        </footer>
      </section>
    </>
  );
}
