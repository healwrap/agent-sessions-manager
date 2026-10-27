import { useState } from 'react';
import { FolderOpen, Link2, Package } from 'lucide-react';
import { AgentIcon } from './agent-icon';
import { EditorDialog, StatusBadge, TextInput } from './form-controls';
import { Button } from './primitives';
import { Select } from './select';
import {
  skillActions,
  skillStates,
  type SkillAction,
  type SkillTarget,
} from '../lib/skill-preview';

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
  onComplete: (
    action: SkillAction,
    ids: string[],
    method: 'link' | 'copy',
    path: string,
  ) => void;
}) {
  const [ids, setIds] = useState(initialIds);
  const [method, setMethod] = useState<'link' | 'copy'>(
    targets.find((target) => target.id === initialIds[0])?.method || 'link',
  );
  const [path, setPath] = useState(
    targets.find((target) => target.id === initialIds[0])?.path || '',
  );
  const selected = targets.filter((target) => ids.includes(target.id));
  const configure = action === 'configure';
  const remove = action === 'remove';
  const title = configure
    ? '配置 Skill 安装入口'
    : `${skillActions[action]} Agent Sessions`;
  return (
    <EditorDialog
      title={title}
      description="交互预览 · 以下操作只改变示例状态，不写入真实安装目录。"
      busy={false}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        onComplete(action, ids, method, path);
      }}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!ids.length || (configure && !path.trim())}
          >
            演示{skillActions[action]}
            {!configure && `（${ids.length}）`}
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
              : '选择安装到哪些 Agent'}
        </h3>
        {(configure || remove ? selected : targets).map((target) => (
          <label className="skill-dialog-target" key={target.id}>
            {!configure && !remove && (
              <input
                type="checkbox"
                checked={ids.includes(target.id)}
                disabled={!target.path}
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
            <FolderOpen size={14} /> 安装入口路径
          </span>
          <TextInput
            autoFocus
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="填写该 Agent 的 agent-sessions 安装入口"
          />
          <small>指向该 Agent 的 Skill 目录下的 agent-sessions 入口。</small>
        </label>
      ) : remove ? (
        <div className="skill-operation-note">
          <Package size={18} />
          <p>
            卸载选中 Agent 的安装入口。保留 Skill 源文件、其他 Agent
            的安装和全部历史会话。
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
                ? '链接到应用管理的 Skill。以后更新应用时，安装入口保持同步。'
                : '复制一份到 Agent 的 Skill 目录。可以独立修改，后续更新由你选择。'}
            </p>
          </div>
          <div className="skill-dialog-summary">
            <span>安装范围</span>
            <strong>当前用户</strong>
            <span>安装后</span>
            <strong>在 Agent 中新建会话验证加载</strong>
          </div>
        </>
      )}
    </EditorDialog>
  );
}
