import { useState } from 'react';
import type {
  BrowserProfile,
  AppProfile,
  GateDefinition,
  ProxyConfig,
} from '../lib/environment-settings';
import { request } from '../lib/api';
import { Button, Field } from './ui';
import { Select } from './select';
import { TextInput } from './form-controls';
import { SettingsRow } from './settings/row';
import { Disclosure } from './disclosure';

export function BrowserProfileFields({
  value,
  proxies,
  gates,
  onChange,
}: {
  value: BrowserProfile | AppProfile;
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
      {'engine' in value && (
        <div className="environment-form-grid">
          <Field label="Agent">
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
          </Field>
          <Field label="浏览器内核">
            <Select
              label="环境浏览器"
              value={
                value.engine === 'ccbaga'
                  ? 'fingerprint-chromium'
                  : value.engine
              }
              options={[
                {
                  value: 'fingerprint-chromium',
                  label: 'Fingerprint Chromium',
                },
                { value: 'chrome', label: 'Google Chrome（原生指纹）' },
              ]}
              onChange={(engine) =>
                onChange({ engine: engine as BrowserProfile['engine'] })
              }
            />
          </Field>
        </div>
      )}
      <Field label="专用代理">
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
      </Field>
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
              {mode === 'proxy' && <span>备用值</span>}
              <TextInput
                aria-label={
                  mode === 'proxy' ? `${title}备用值` : `环境${title}`
                }
                required
                value={value[field]}
                onChange={(event) => onChange({ [field]: event.target.value })}
              />
            </div>
          );
        })}
      </div>
      <div className="environment-region-preview">
        <Button disabled={reading} onClick={() => void inspect()}>
          {reading ? '正在查询出口…' : '预览出口语言与时区'}
        </Button>
        {region && <span>{region}</span>}
      </div>
      <Field label="指定出口 IP（可选）" htmlFor="browser-profile-fields-3">
        <TextInput
          id="browser-profile-fields-3"
          value={value.expected_ip || ''}
          onChange={(event) => onChange({ expected_ip: event.target.value })}
          placeholder="留空时与启动预检出口比较"
        />
      </Field>
      {'engine' in value && (
        <Field
          label="预期 DNS 服务器（可选）"
          htmlFor="browser-profile-fields-4"
        >
          <TextInput
            id="browser-profile-fields-4"
            value={value.expected_dns || ''}
            onChange={(event) => onChange({ expected_dns: event.target.value })}
            placeholder="填写 IP，以英文逗号分隔；留空时只展示解析器观测"
          />
        </Field>
      )}
      {'fingerprint_seed' in value && value.engine !== 'chrome' && (
        <>
          {' '}
          <Field label="稳定指纹种子" htmlFor="environment-fingerprint-seed">
            <div className="environment-seed">
              <TextInput
                id="environment-fingerprint-seed"
                required
                value={value.fingerprint_seed}
                onChange={(event) =>
                  onChange({ fingerprint_seed: event.target.value })
                }
              />
              <Button
                onClick={() =>
                  onChange({ fingerprint_seed: crypto.randomUUID() })
                }
              >
                重新生成
              </Button>
            </div>
          </Field>
        </>
      )}
      <Disclosure
        className="environment-gate-editor"
        title="启动门控"
        scrollToEndOnOpen
      >
        {gates
          .filter(
            (gate) =>
              'engine' in value ||
              ['proxy', 'region', 'exit_ip'].includes(gate.id),
          )
          .map((gate) => (
            <SettingsRow key={gate.id} label={gate.title}>
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
            </SettingsRow>
          ))}
      </Disclosure>
    </>
  );
}
