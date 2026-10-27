import { useEffect, useRef, useState } from 'react';
import type {
  BrowserAccount,
  EnvironmentSettings,
} from '../lib/environment-settings';
import { Button } from './primitives';
import { EditorDialog, TextInput } from './form-controls';
import { Select } from './select';
export interface AccountRoute {
  proxy_id: string;
  proxy_url?: string;
}
export function AccountEditor({
  account,
  data,
  busy,
  onSave,
  onClose,
}: {
  account?: BrowserAccount;
  data: EnvironmentSettings;
  busy: boolean;
  onSave: (account: BrowserAccount, route: AccountRoute) => Promise<void>;
  onClose: () => void;
}) {
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameInput.current?.focus();
  }, []);
  const [value, setValue] = useState<BrowserAccount>(
    () =>
      account || {
        id: '',
        name: '',
        provider: 'claude',
        profile_id: '__new__',
        app_profile_id: '__new__',
      },
  );
  const [proxy, setProxy] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const creating =
    value.profile_id === '__new__' || value.app_profile_id === '__new__';
  return (
    <EditorDialog
      title={account ? '编辑账号' : '添加账号'}
      description="绑定独立浏览器和官方 App 环境，分别保存登录状态。"
      busy={busy}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(value, {
          proxy_id: proxy === '__custom__' ? '' : proxy,
          ...(proxy === '__custom__' ? { proxy_url: url } : {}),
        })
          .then(onClose)
          .catch((reason) => setError(String(reason)));
      }}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || (!value.profile_id && !value.app_profile_id)}
          >
            {busy ? '保存中…' : account ? '保存账号' : '创建账号与环境'}
          </Button>
        </>
      }
    >
      <label className="environment-field">
        账号名称
        <TextInput
          ref={nameInput}
          autoFocus
          required
          value={value.name}
          onChange={(event) => setValue({ ...value, name: event.target.value })}
          placeholder="例如：Claude 工作账号"
        />
      </label>
      <div className="environment-field">
        <span>Agent</span>
        <Select
          label="账号 Agent"
          value={value.provider}
          options={[
            { value: 'claude', label: 'Claude' },
            { value: 'codex', label: 'Codex' },
          ]}
          onChange={(provider) =>
            setValue({
              ...value,
              provider: provider as BrowserAccount['provider'],
              profile_id: '__new__',
              app_profile_id: provider === 'claude' ? '__new__' : '',
            })
          }
        />
      </div>
      <div className="environment-field">
        <span>浏览器环境</span>
        <Select
          label="账号浏览器环境"
          value={value.profile_id}
          options={[
            { value: '__new__', label: '自动创建独立浏览器环境' },
            { value: '', label: '暂不绑定浏览器' },
            ...data.profiles
              .filter(
                (profile) =>
                  profile.provider === value.provider &&
                  !data.accounts.some(
                    (other) =>
                      other.id !== value.id && other.profile_id === profile.id,
                  ),
              )
              .map((profile) => ({
                value: profile.id,
                label: profile.name,
              })),
          ]}
          onChange={(profile_id) => setValue({ ...value, profile_id })}
        />
      </div>
      {value.provider === 'claude' && (
        <div className="environment-field">
          <span>Claude App 环境</span>
          <Select
            label="账号 App 环境"
            value={value.app_profile_id || ''}
            options={[
              { value: '__new__', label: '自动创建独立 App 环境' },
              { value: '', label: '暂不绑定 App' },
              ...data.app_profiles
                .filter(
                  (profile) =>
                    !data.accounts.some(
                      (other) =>
                        other.id !== value.id &&
                        other.app_profile_id === profile.id,
                    ),
                )
                .map((profile) => ({
                  value: profile.id,
                  label: profile.name,
                })),
            ]}
            onChange={(app_profile_id) =>
              setValue({ ...value, app_profile_id })
            }
          />
          <small>
            官方 App 切换时退出上一个隔离环境，再载入所选账号的数据。
          </small>
        </div>
      )}
      {creating && (
        <div className="environment-field">
          <span>新环境的代理</span>
          <Select
            label="新环境代理"
            value={proxy}
            options={[
              { value: '', label: '系统路由' },
              ...data.proxies.map((item) => ({
                value: item.id,
                label: item.name,
              })),
              { value: '__custom__', label: '添加专用代理…' },
            ]}
            onChange={setProxy}
          />
          {proxy === '__custom__' && (
            <TextInput
              aria-label="新账号代理地址"
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="http://127.0.0.1:7897 或 socks5://用户名:密码@主机:端口"
              spellCheck={false}
            />
          )}
          <small>
            新环境按出口定位语言与时区，备用值为 en-US /
            America/Los_Angeles。可在环境配置中改为手动设置，并逐项调整启动门控。
          </small>
        </div>
      )}
      {error && (
        <p role="alert" className="environment-error">
          {error}
        </p>
      )}
    </EditorDialog>
  );
}
