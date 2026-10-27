import { MessagesSquare, Puzzle, UsersRound } from 'lucide-react';
import type { WorkspacePage } from '../workspace';
import { Select } from './select';

export const workspaceChoices = [
  {
    value: 'sessions' as const,
    label: '会话管理',
    icon: <MessagesSquare size={18} />,
  },
  {
    value: 'accounts' as const,
    label: '账号与环境管理',
    icon: <UsersRound size={18} />,
  },
  { value: 'skills' as const, label: 'Skill 管理', icon: <Puzzle size={18} /> },
];

export function WorkspacePicker({
  value,
  onChange,
}: {
  value: WorkspacePage;
  onChange: (page: WorkspacePage) => void;
}) {
  return (
    <div className="workspace-picker">
      <Select
        label="切换工作区"
        value={value}
        onChange={(next) => onChange(next as WorkspacePage)}
        options={workspaceChoices}
      />
    </div>
  );
}
