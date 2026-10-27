import { useEffect, useRef, useState } from 'react';
import type {
  BrowserProfile,
  AppProfile,
  ProxyConfig,
  GateDefinition,
  EnvironmentCollection,
  EnvironmentItem,
} from '../lib/environment-settings';
import { Button, Field, Notice } from './ui';
import { EditorDialog, TextInput } from './form-controls';
import { BrowserProfileFields } from './browser-profile-fields';

export type EnvironmentEdit =
  | { kind: 'profiles'; item?: BrowserProfile }
  | { kind: 'proxies'; item?: ProxyConfig }
  | { kind: 'app_profiles'; item?: AppProfile };

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
  const profile = edit.kind !== 'proxies';
  const native = edit.kind === 'app_profiles';
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameInput.current?.focus();
  }, []);
  const [value, setValue] = useState<BrowserProfile | AppProfile | ProxyConfig>(
    () =>
      edit.item ||
      (native
        ? {
            id: '',
            name: '',
            proxy_id: '',
            locale: 'en-US',
            timezone: 'America/Los_Angeles',
            locale_mode: 'proxy',
            timezone_mode: 'proxy',
            gates: {},
          }
        : profile
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
  const title = `${edit.item ? '编辑' : '新建'}${native ? 'Claude App 环境' : profile ? '浏览器环境' : '代理配置'}`;
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
    <EditorDialog
      title={title}
      busy={saving}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? '保存中…' : '保存配置'}
          </Button>
        </>
      }
    >
      <Field label="名称" htmlFor="environment-editor-0">
        <TextInput
          id="environment-editor-0"
          autoFocus
          ref={nameInput}
          required
          maxLength={120}
          value={value.name}
          onChange={(event) => field('name', event.target.value)}
          placeholder={profile ? '例如：Claude 日常使用' : '例如：美国固定出口'}
        />
      </Field>
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
        <Field label="代理地址" htmlFor="environment-editor-1">
          <TextInput
            id="environment-editor-1"
            required
            value={proxy.url}
            onChange={(event) => field('url', event.target.value)}
            placeholder="http://127.0.0.1:7897"
            spellCheck={false}
          />
        </Field>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </EditorDialog>
  );
}
