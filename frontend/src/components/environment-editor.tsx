import { useEffect, useRef, useState } from 'react';
import type { BrowserProfile, ProxyConfig } from '../lib/environment-settings';
import { Button, Dialog, IconButton } from './primitives';
import { Select } from './select';

export type EnvironmentEdit =
  | { kind: 'profiles'; item?: BrowserProfile }
  | { kind: 'proxies'; item?: ProxyConfig };

export function EnvironmentEditor({
  edit,
  proxies,
  onSave,
  onClose,
}: {
  edit: EnvironmentEdit;
  proxies: ProxyConfig[];
  onSave: (
    kind: 'profiles' | 'proxies',
    item: BrowserProfile | ProxyConfig,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const profile = edit.kind === 'profiles';
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameInput.current?.focus();
  }, []);
  const [value, setValue] = useState(
    () =>
      edit.item ||
      (profile
        ? {
            id: '',
            name: '',
            provider: 'claude',
            engine: 'ccbaga',
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
            <>
              <div className="environment-form-grid">
                <div className="environment-field">
                  <span>Agent</span>
                  <Select
                    label="环境 Agent"
                    value={browser.provider}
                    options={[
                      { value: 'claude', label: 'Claude' },
                      { value: 'codex', label: 'Codex' },
                    ]}
                    onChange={(next) => field('provider', next)}
                  />
                </div>
                <div className="environment-field">
                  <span>浏览器</span>
                  <Select
                    label="环境浏览器"
                    value={browser.engine}
                    options={[
                      { value: 'ccbaga', label: 'CCBaga' },
                      { value: 'chrome', label: 'Google Chrome' },
                    ]}
                    onChange={(next) => field('engine', next)}
                  />
                </div>
              </div>
              <div className="environment-field">
                <span>专用代理</span>
                <Select
                  label="环境专用代理"
                  value={browser.proxy_id}
                  options={[
                    { value: '', label: '系统出口' },
                    ...proxies.map((item) => ({
                      value: item.id,
                      label: item.name,
                    })),
                  ]}
                  onChange={(next) => field('proxy_id', next)}
                />
              </div>
              <div className="environment-form-grid">
                <label className="environment-field">
                  语言
                  <input
                    required
                    value={browser.locale}
                    onChange={(event) => field('locale', event.target.value)}
                    placeholder="en-US"
                  />
                  <small>独立语言代码</small>
                </label>
                <label className="environment-field">
                  时区
                  <input
                    required
                    value={browser.timezone}
                    onChange={(event) => field('timezone', event.target.value)}
                    placeholder="America/Los_Angeles"
                  />
                  <small>独立 IANA 时区</small>
                </label>
              </div>
              <div className="environment-field">
                <label htmlFor="environment-fingerprint-seed">
                  稳定指纹种子
                </label>
                <div className="environment-seed">
                  <input
                    id="environment-fingerprint-seed"
                    required
                    value={browser.fingerprint_seed}
                    onChange={(event) =>
                      field('fingerprint_seed', event.target.value)
                    }
                  />
                  <Button
                    onClick={() =>
                      field('fingerprint_seed', crypto.randomUUID())
                    }
                  >
                    重新生成
                  </Button>
                </div>
                <small>固定保存，编辑其他配置时保持不变。</small>
              </div>
            </>
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
              ? '当前保存为配置草稿；浏览器启动、登录隔离和指纹应用待接入。'
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
