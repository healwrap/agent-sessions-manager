import { useEffect, useState } from 'react';
import { FolderOpen, Link2, Package } from 'lucide-react';
import { request } from '../lib/api';
import { AgentIcon } from './agent-icon';
import { EditorDialog, StatusBadge, TextInput } from './form-controls';
import { Button } from './primitives';
import { Select } from './select';
import {
  skillActions,
  skillStates,
  type SkillAction,
  type SkillTarget,
  type SkillPlan,
} from '../lib/skill-management';

export function SkillInstallDialog({
  action,
  targets,
  initialIds,
  onClose,
  onComplete,
}: {
  action: SkillAction;
  targets: SkillTarget[];
  initialIds: string[];
  onClose: () => void;
  onComplete: (token: string) => Promise<void>;
}) {
  const [ids, setIds] = useState(initialIds);
  const [method, setMethod] = useState<'link' | 'copy'>(
    targets.find((target) => target.id === initialIds[0])?.method || 'link',
  );
  const [path, setPath] = useState(
    targets.find((target) => target.id === initialIds[0])?.path || '',
  );
  const [plan, setPlan] = useState<SkillPlan>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const configure = action === 'configure';
  const remove = action === 'remove';
  const selected = targets.filter((target) => ids.includes(target.id));
  const title = configure
    ? '配置 Skill 安装入口'
    : `${skillActions[action]} Agent Sessions`;
  useEffect(() => {
    let current = true;
    setPlan(undefined);
    setError('');
    if (!ids.length || (configure && !path.trim())) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      void request<SkillPlan>(
        '/api/skills/plan',
        {},
        { action, ids, method, ...(configure ? { path } : {}) },
      )
        .then((value) => current && setPlan(value))
        .catch((reason) => current && setError(String(reason)))
        .finally(() => current && setLoading(false));
    }, 180);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [action, ids, method, path, configure, revision]);
  async function submit() {
    if (!plan) return;
    setBusy(true);
    setError('');
    try {
      await onComplete(plan.token);
    } catch (reason) {
      setError(String(reason));
      setPlan(undefined);
    } finally {
      setBusy(false);
    }
  }
  return (
    <EditorDialog
      title={title}
      description="按下确认后执行真实操作；已有安装入口会保留备份。"
      busy={busy}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || loading || !plan}
          >
            {busy
              ? `正在${skillActions[action]}…`
              : loading
                ? '正在检查…'
                : `${skillActions[action]}${configure ? '' : `（${ids.length}）`}`}
          </Button>
        </>
      }
    >
      <div className="skill-dialog-targets">
        <h3>
          {configure
            ? '目标 Agent'
            : remove
              ? '移除以下安装入口'
              : '选择安装目标'}
        </h3>
        {(configure || remove ? selected : targets).map((target) => (
          <label className="skill-dialog-target" key={target.id}>
            {!configure && !remove && (
              <input
                type="checkbox"
                checked={ids.includes(target.id)}
                disabled={!target.path || busy}
                onChange={(event) =>
                  setIds((value) =>
                    event.target.checked
                      ? [...value, target.id]
                      : value.filter((id) => id !== target.id),
                  )
                }
              />
            )}
            <AgentIcon source={target.id} />
            <span>
              <strong>{target.name}</strong>
              <small>{target.path || '先配置安装入口'}</small>
            </span>
            <StatusBadge tone={skillStates[target.state].tone}>
              {skillStates[target.state].label}
            </StatusBadge>
          </label>
        ))}
      </div>
      {configure ? (
        <label className="environment-field">
          <span>
            <FolderOpen size={14} />
            安装入口路径
          </span>
          <TextInput
            autoFocus
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="填写该 Agent 的 agent-sessions 安装入口"
          />
          <small>
            填写该客户端实际使用的 Skill 目录下的 agent-sessions 完整路径。
          </small>
        </label>
      ) : remove ? (
        <div className="skill-operation-note">
          <Package size={18} />
          <p>
            将安装入口移入应用备份。保留 Skill
            源文件与历史会话，可从操作记录恢复原入口。
          </p>
        </div>
      ) : (
        <>
          <label className="environment-field">
            安装方式
            <Select
              label="Skill 安装方式"
              value={method}
              onChange={(value) => setMethod(value as 'link' | 'copy')}
              disabled={busy}
              options={[
                { value: 'link', label: '跟随应用（推荐）' },
                { value: 'copy', label: '独立副本' },
              ]}
            />
          </label>
          <div className="skill-operation-note">
            {method === 'link' ? <Link2 size={18} /> : <Package size={18} />}
            <p>
              {method === 'link'
                ? '链接到应用管理的稳定目录。应用提供新版本后，此入口跟随更新。'
                : '复制完整的 Skill、说明与运行入口。保留独立内容，后续手动更新。'}
            </p>
          </div>
        </>
      )}
      {plan && (
        <div className="skill-plan">
          <h3>本次操作计划</h3>
          {plan.items.map((item) => (
            <div key={item.id}>
              <strong>{item.name}</strong>
              <code>{item.path}</code>
              {item.backup && <small>原入口会先备份</small>}
              {item.affects.length > 0 && (
                <p>同一目录还供以下入口使用：{item.affects.join('、')}</p>
              )}
              {item.modified_files.length > 0 && (
                <details>
                  <summary>
                    查看检测到的文件变化（{item.modified_files.length}）
                  </summary>
                  {item.modified_files.map((name) => (
                    <code key={name}>{name}</code>
                  ))}
                </details>
              )}
            </div>
          ))}
        </div>
      )}
      {error && (
        <div className="environment-error-bar" role="alert">
          <span>{error}</span>
          <Button
            onClick={() => setRevision((value) => value + 1)}
            disabled={busy}
          >
            重新检查
          </Button>
        </div>
      )}
      {!configure && !remove && (
        <div className="skill-dialog-summary">
          <span>安装范围</span>
          <strong>当前用户</strong>
          <span>安装后</span>
          <strong>在 Agent 的新会话中验证加载</strong>
        </div>
      )}
    </EditorDialog>
  );
}
