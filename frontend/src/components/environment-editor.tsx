import { useState } from 'react';
import type {
  BrowserProfile,
  AppProfile,
  ProxyConfig,
  GateDefinition,
  EnvironmentCollection,
  EnvironmentItem,
} from '../lib/environment-settings';
import { Button, Field, Notice, toast } from './ui';
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
  accountName,
  onSave,
  onClose,
}: {
  edit: Exclude<EnvironmentEdit, { kind: 'proxies' }>;
  proxies: ProxyConfig[];
  gates: GateDefinition[];
  accountName?: string;
  onSave: (kind: EnvironmentCollection, item: EnvironmentItem) => Promise<void>;
  onClose: () => void;
}) {
  const native = edit.kind === 'app_profiles';
  const [value, setValue] = useState<BrowserProfile | AppProfile>(
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
            inherit_skills: true,
            inherit_plugins: true,
          }
        : {
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
          }),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const browser = value as BrowserProfile;
  const title = `${edit.item ? '编辑' : '新建'}${native ? 'Claude App 环境' : '浏览器环境'}`;
  const save = async () => {
    setError('');
    try {
      Intl.getCanonicalLocales(browser.locale);
      new Intl.DateTimeFormat('en', { timeZone: browser.timezone }).format();
    } catch {
      setError('请填写有效的语言代码与时区，例如 en-US、America/Los_Angeles。');
      return;
    }
    setSaving(true);
    try {
      await onSave(edit.kind, value as BrowserProfile | AppProfile);
      onClose();
    } catch (reason) {
      toast(String(reason), { tone: 'error' });
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
      <Field
        label={
          accountName && browser.name_account_id
            ? '名称（随账号更新，可自定义）'
            : '名称'
        }
        htmlFor="environment-editor-0"
      >
        <TextInput
          id="environment-editor-0"
          required
          maxLength={120}
          value={value.name}
          onChange={(event) =>
            setValue((current) => ({
              ...current,
              name: event.target.value,
              name_account_id: '',
            }))
          }
          placeholder="填写账号邮箱或名字"
        />
      </Field>
      <BrowserProfileFields
        value={browser}
        proxies={proxies}
        gates={gates}
        onChange={(patch) => setValue((current) => ({ ...current, ...patch }))}
      />
      {error && <Notice tone="error">{error}</Notice>}
    </EditorDialog>
  );
}
