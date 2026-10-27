import { Globe2, Pencil, Plus, ScanLine, Trash2 } from 'lucide-react';
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
    <section className="environment-profile-list" aria-label="代理配置列表">
      {data.proxies.map((item) => {
        const bindings = [...data.profiles, ...data.app_profiles].filter(
          (profile) => profile.proxy_id === item.id,
        ).length;
        return (
          <article
            className="environment-panel environment-profile"
            key={item.id}
          >
            <header className="environment-profile-heading">
              <Globe2 size={22} />
              <div className="environment-profile-name">
                <h2>{item.name}</h2>
              </div>
              <StatusBadge>{bindings} 个环境</StatusBadge>
              <div className="environment-row-actions">
                <Button
                  variant="text"
                  aria-label={`检测代理 ${item.name}`}
                  onClick={() => onInspect(item.url)}
                >
                  <ScanLine size={16} />
                  检测
                </Button>
                <IconButton
                  label={`编辑代理 ${item.name}`}
                  icon={<Pencil size={16} />}
                  onClick={() => onEdit(item)}
                  disabled={busy}
                />
                <IconButton
                  label={`删除代理配置 ${item.name}`}
                  icon={<Trash2 size={16} />}
                  onClick={() => onDelete(item.id)}
                  disabled={busy}
                />
              </div>
            </header>
            <div className="environment-proxy-address">
              <code>{item.url}</code>
            </div>
          </article>
        );
      })}
      {!data.proxies.length && (
        <div className="environment-panel environment-empty">
          <h3>{loading ? '正在读取代理配置…' : '还没有代理配置'}</h3>
          <Button onClick={() => onEdit()} disabled={loading || busy}>
            <Plus size={16} />
            添加代理
          </Button>
        </div>
      )}
    </section>
  );
}
