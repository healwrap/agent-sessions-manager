import { useState } from 'react';
import type {
  BrowserProfile,
  GateDefinition,
  ProxyConfig,
} from '../lib/environment-settings';
import { request } from '../lib/api';
import { Button } from './primitives';
import { Select } from './select';

export function BrowserProfileFields({
  value,
  proxies,
  gates,
  onChange,
}: {
  value: BrowserProfile;
  proxies: ProxyConfig[];
  gates: GateDefinition[];
  onChange: (patch: Partial<BrowserProfile>) => void;
}) {
  const [region, setRegion] = useState('');
  const [reading, setReading] = useState(false);
  const inspect = async () => {
    setReading(true);
    try {
      const result = await request<{
        country: string;
        ip: string;
        locale: string;
        timezone: string;
        error: string;
      }>('/api/browser-runtime/region', {}, { proxy_id: value.proxy_id });
      setRegion(
        result.error ||
          `${result.ip} · ${result.country} · ${result.locale} · ${result.timezone}`,
      );
    } catch (reason) {
      setRegion(String(reason));
    } finally {
      setReading(false);
    }
  };
  return (
    <>
      <div className="environment-form-grid">
        <div className="environment-field">
          <span>Agent</span>
          <Select
            label="环境 Agent"
            value={value.provider}
            options={[
              { value: 'claude', label: 'Claude' },
              { value: 'codex', label: 'Codex' },
            ]}
            onChange={(provider) =>
              onChange({ provider: provider as BrowserProfile['provider'] })
            }
          />
        </div>
        <div className="environment-field">
          <span>浏览器内核</span>
          <Select
            label="环境浏览器"
            value={
              value.engine === 'ccbaga' ? 'fingerprint-chromium' : value.engine
            }
            options={[
              { value: 'fingerprint-chromium', label: 'Fingerprint Chromium' },
              ...(value.engine === 'chrome'
                ? [
                    {
                      value: 'chrome',
                      label: 'Google Chrome（请切换内核后启动）',
                    },
                  ]
                : []),
            ]}
            onChange={(engine) =>
              onChange({ engine: engine as BrowserProfile['engine'] })
            }
          />
        </div>
      </div>
      <div className="environment-field">
        <span>专用代理</span>
        <Select
          label="环境专用代理"
          value={value.proxy_id}
          options={[
            { value: '', label: '系统路由' },
            ...proxies.map((proxy) => ({ value: proxy.id, label: proxy.name })),
          ]}
          onChange={(proxy_id) => {
            setRegion('');
            onChange({ proxy_id });
          }}
        />
        <small>
          可先在「代理设置」添加 HTTP / HTTPS / SOCKS5
          代理，支持用户名与密码认证。
        </small>
      </div>
      <div className="environment-form-grid">
        {(['locale', 'timezone'] as const).map((field) => {
          const title = field === 'locale' ? '语言' : '时区';
          const mode = value[`${field}_mode`] || 'manual';
          return (
            <div className="environment-field" key={field}>
              <span>{title}</span>
              <Select
                label={`${title}来源`}
                value={mode}
                options={[
                  { value: 'manual', label: '手动设置' },
                  { value: 'proxy', label: '跟随代理出口' },
                ]}
                onChange={(next) => onChange({ [`${field}_mode`]: next })}
              />
              <input
                aria-label={
                  mode === 'proxy' ? `${title}备用值` : `环境${title}`
                }
                required
                value={value[field]}
                onChange={(event) => onChange({ [field]: event.target.value })}
              />
              <small>
                {mode === 'proxy'
                  ? '定位失败时的备用值；是否放行由出口定位门控决定。'
                  : field === 'locale'
                    ? '独立语言代码，例如 en-US。'
                    : '独立 IANA 时区。'}
              </small>
            </div>
          );
        })}
      </div>
      <div className="environment-region-preview">
        <Button disabled={reading} onClick={() => void inspect()}>
          {reading ? '正在查询出口…' : '预览出口语言与时区'}
        </Button>
        <small>{region || '语言按出口地区推荐；启动时重新读取。'}</small>
      </div>
      <label className="environment-field">
        指定出口 IP（可选）
        <input
          value={value.expected_ip || ''}
          onChange={(event) => onChange({ expected_ip: event.target.value })}
          placeholder="留空时与启动预检出口比较"
        />
      </label>
      <div className="environment-field">
        <label htmlFor="environment-fingerprint-seed">稳定指纹种子</label>
        <div className="environment-seed">
          <input
            id="environment-fingerprint-seed"
            required
            value={value.fingerprint_seed}
            onChange={(event) =>
              onChange({ fingerprint_seed: event.target.value })
            }
          />
          <Button
            onClick={() => onChange({ fingerprint_seed: crypto.randomUUID() })}
          >
            重新生成
          </Button>
        </div>
        <small>每次启动使用相同种子；登录状态保存在此环境的独立目录。</small>
      </div>
      <details className="environment-gate-editor" open>
        <summary>启动门控</summary>
        <p>强制项失败或未验证会拦截；提醒项继续启动；关闭项跳过检查。</p>
        {gates.map((gate) => (
          <div className="environment-gate-setting" key={gate.id}>
            <div>
              <strong>{gate.title}</strong>
              <small>{gate.description}</small>
            </div>
            <Select
              label={`${gate.title}门控`}
              value={value.gates?.[gate.id] || gate.default_mode}
              options={[
                { value: 'block', label: '强制拦截' },
                { value: 'warn', label: '仅提醒' },
                { value: 'off', label: '关闭' },
              ]}
              onChange={(mode) =>
                onChange({
                  gates: {
                    ...value.gates,
                    [gate.id]: mode as 'block' | 'warn' | 'off',
                  },
                })
              }
            />
          </div>
        ))}
      </details>
    </>
  );
}
