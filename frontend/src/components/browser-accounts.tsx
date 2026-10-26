import { useState } from 'react';
import { Pencil, Play, Plus, Square, Trash2 } from 'lucide-react';
import type {
  BrowserAccount,
  EnvironmentSettings,
} from '../lib/environment-settings';
import { runLabels } from '../lib/environment-settings';
import { Button, Dialog, IconButton } from './primitives';
import { Select } from './select';
import { AgentIcon } from './agent-icon';
import { BrowserLaunchReport } from './browser-launch-report';
export function BrowserAccounts({
  data,
  busy,
  onSave,
  onDelete,
  onRuntime,
  onCreateEnvironment,
}: {
  data: EnvironmentSettings;
  busy: boolean;
  onSave: (account: BrowserAccount) => Promise<void>;
  onDelete: (id: string) => void;
  onRuntime: (
    action: 'start' | 'stop',
    body: { profile_id?: string; account_id?: string },
  ) => void;
  onCreateEnvironment: () => void;
}) {
  const [edit, setEdit] = useState<BrowserAccount>();
  const [error, setError] = useState('');
  const create = () => {
    setError('');
    setEdit({ id: '', name: '', provider: 'claude', profile_id: '' });
  };
  return (
    <>
      <section className="environment-panel">
        <header className="environment-panel-heading">
          <h2>
            浏览器账号 <span>{data.accounts.length}</span>
          </h2>
          <Button onClick={create} disabled={busy || !data.profiles.length}>
            <Plus size={15} />
            添加账号
          </Button>
        </header>
        {data.accounts.map((account) => {
          const profile = data.profiles.find(
            (row) => row.id === account.profile_id,
          );
          const run = data.browser.runs.find(
            (row) => row.profile_id === account.profile_id,
          );
          const live = run?.alive || run?.status === 'checking';
          return (
            <div className="environment-account-row" key={account.id}>
              <AgentIcon source={account.provider} />
              <div>
                <strong>{account.name}</strong>
                <p>
                  {profile?.name || '环境已不存在'} ·{' '}
                  {run ? runLabels[run.status] : '尚未启动'}
                </p>
              </div>
              <div className="environment-row-actions">
                <Button
                  disabled={busy}
                  onClick={() =>
                    onRuntime(
                      live ? 'stop' : 'start',
                      live
                        ? { profile_id: account.profile_id }
                        : { account_id: account.id },
                    )
                  }
                >
                  {live ? <Square size={14} /> : <Play size={14} />}
                  {live ? '停止环境' : '检查并启动'}
                </Button>
                <button
                  disabled={busy || live}
                  aria-label={`编辑账号 ${account.name}`}
                  onClick={() => {
                    setError('');
                    setEdit(account);
                  }}
                >
                  <Pencil size={15} />
                </button>
                <button
                  disabled={busy || live}
                  aria-label={`删除账号 ${account.name}`}
                  onClick={() => onDelete(account.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          );
        })}
        {!data.accounts.length && (
          <div className="environment-empty">
            <h3>将账号绑定到独立浏览器环境</h3>
            <p>
              添加账号名称与环境绑定，启动检查通过后打开对应网站。首次启动后在浏览器中登录，后续保留登录状态。
            </p>
            <Button
              onClick={data.profiles.length ? create : onCreateEnvironment}
            >
              {data.profiles.length ? '添加账号' : '先创建浏览器环境'}
            </Button>
          </div>
        )}
        <footer className="environment-panel-note">
          每个环境绑定一个账号。删除账号记录会保留浏览器登录数据。
        </footer>
      </section>
      {data.browser.runs
        .filter((run) => run.account_id)
        .map((run) => (
          <BrowserLaunchReport key={run.profile_id} run={run} />
        ))}
      {edit && (
        <Dialog
          open
          title={edit.id ? '编辑账号' : '添加账号'}
          className="environment-editor"
          onClose={() => !busy && setEdit(undefined)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void onSave(edit)
                .then(() => setEdit(undefined))
                .catch((reason) => setError(String(reason)));
            }}
          >
            <header>
              <div>
                <h2>{edit.id ? '编辑账号' : '添加账号'}</h2>
                <p>绑定环境后，启动前执行此环境的门控策略。</p>
              </div>
              <IconButton
                icon="close"
                label="关闭账号编辑"
                onClick={() => setEdit(undefined)}
                disabled={busy}
              />
            </header>
            <fieldset disabled={busy}>
              <label className="environment-field">
                账号名称
                <input
                  autoFocus
                  required
                  value={edit.name}
                  onChange={(event) =>
                    setEdit({ ...edit, name: event.target.value })
                  }
                  placeholder="例如：Claude 主账号"
                />
              </label>
              <div className="environment-field">
                <span>Agent</span>
                <Select
                  label="账号 Agent"
                  value={edit.provider}
                  options={[
                    { value: 'claude', label: 'Claude' },
                    { value: 'codex', label: 'Codex' },
                  ]}
                  onChange={(provider) =>
                    setEdit({
                      ...edit,
                      provider: provider as BrowserAccount['provider'],
                      profile_id: '',
                    })
                  }
                />
              </div>
              <div className="environment-field">
                <span>绑定浏览器环境</span>
                <Select
                  label="账号浏览器环境"
                  value={edit.profile_id}
                  options={[
                    { value: '', label: '请选择独立环境' },
                    ...data.profiles
                      .filter(
                        (profile) =>
                          profile.provider === edit.provider &&
                          !data.accounts.some(
                            (account) =>
                              account.id !== edit.id &&
                              account.profile_id === profile.id,
                          ),
                      )
                      .map((profile) => ({
                        value: profile.id,
                        label: profile.name,
                      })),
                  ]}
                  onChange={(profile_id) => setEdit({ ...edit, profile_id })}
                />
              </div>
              {error && (
                <p className="environment-error" role="alert">
                  {error}
                </p>
              )}
            </fieldset>
            <footer>
              <Button onClick={() => setEdit(undefined)} disabled={busy}>
                取消
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={busy || !edit.profile_id}
              >
                {busy ? '保存中…' : '保存账号'}
              </Button>
            </footer>
          </form>
        </Dialog>
      )}
    </>
  );
}
