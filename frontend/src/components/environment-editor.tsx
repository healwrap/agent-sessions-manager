import { useEffect, useRef, useState } from 'react';
import type {
  BrowserProfile,
  ProxyConfig,
  GateDefinition,
  EnvironmentCollection,
  EnvironmentItem,
} from '../lib/environment-settings';
import { Button, Dialog, IconButton } from './primitives';
import { BrowserProfileFields } from './browser-profile-fields';

export type EnvironmentEdit =
  | { kind: 'profiles'; item?: BrowserProfile }
  | { kind: 'proxies'; item?: ProxyConfig };

export function EnvironmentEditor({
  edit,
  proxies,
  gates,
  onSave,
  onClose,
}: {
  edit: EnvironmentEdit;
  proxies: ProxyConfig[];
  gates: GateDefinition[];
  onSave: (kind: EnvironmentCollection, item: EnvironmentItem) => Promise<void>;
  onClose: () => void;
}) {
  const profile = edit.kind === 'profiles';
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameInput.current?.focus();
  }, []);
  const [value, setValue] = useState<BrowserProfile | ProxyConfig>(
    () =>
      edit.item ||
      (profile
        ? {
            id: '',
            name: '',
            provider: 'claude',
            engine: 'fingerprint-chromium',
            locale_mode: 'proxy',
            timezone_mode: 'proxy',
            gates: {},
            proxy_id: '',
            locale: 'en-US',
            timezone: 'America/Los_Angeles',
            fingerprint_seed: crypto.randomUUID(),
          }
        : { id: '', name: '', url: '' }),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const field = (key: string, next: string) =>
    setValue((current) => ({ ...current, [key]: next }));
  const browser = value as BrowserProfile;
  const proxy = value as ProxyConfig;
  const title = `${edit.item ? '编辑' : '新建'}${profile ? '浏览器环境' : '代理配置'}`;
  const save = async () => {
    setError('');
    try {
      if (profile) {
        Intl.getCanonicalLocales(browser.locale);
        new Intl.DateTimeFormat('en', { timeZone: browser.timezone }).format();
      }
    } catch {
      setError('请填写有效的语言代码与时区，例如 en-US、America/Los_Angeles。');
      return;
    }
    setSaving(true);
    try {
      await onSave(edit.kind, value as BrowserProfile | ProxyConfig);
      onClose();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open
      title={title}
      className="environment-editor"
      onClose={() => !saving && onClose()}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <header>
          <div>
            <h2>{title}</h2>
            <p>
              {profile
                ? '每个环境独立设置，保存后可继续编辑。'
                : '添加可供环境引用的专用代理。'}
            </p>
          </div>
          <IconButton
            icon="close"
            label="关闭配置编辑"
            onClick={onClose}
            disabled={saving}
          />
        </header>
        <fieldset disabled={saving}>
          <label className="environment-field">
            名称
            <input
              autoFocus
              ref={nameInput}
              required
              maxLength={120}
              value={value.name}
              onChange={(event) => field('name', event.target.value)}
              placeholder={
                profile ? '例如：Claude 日常使用' : '例如：美国固定出口'
              }
            />
          </label>
          {profile ? (
            <BrowserProfileFields
              value={browser}
              proxies={proxies}
              gates={gates}
              onChange={(patch) =>
                setValue((current) => ({ ...current, ...patch }))
              }
            />
          ) : (
            <label className="environment-field">
              代理地址
              <input
                required
                value={proxy.url}
                onChange={(event) => field('url', event.target.value)}
                placeholder="http://127.0.0.1:7897"
                spellCheck={false}
              />
              <small>支持 HTTP、HTTPS、SOCKS5 与 SOCKS5h，需包含端口。</small>
            </label>
          )}
          <p className="environment-form-note">
            {profile
              ? '启动时应用独立代理、语言、时区与指纹，通过门控后进入账号网站。'
              : '保存为代理配置；实际路由由使用它的浏览器或 App 决定。'}
          </p>
          {error && (
            <p className="environment-error" role="alert">
              {error}
            </p>
          )}
        </fieldset>
        <footer>
          <Button onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? '保存中…' : '保存配置'}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}
