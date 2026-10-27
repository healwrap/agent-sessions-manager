import { Clock3 } from 'lucide-react';
import type { SkillRecord } from '../lib/skill-management';
import { skillActions } from '../lib/skill-management';
import { Button, Disclosure, Panel } from './ui';

export function SkillHistory({
  records,
  busy,
  onRestore,
}: {
  records: SkillRecord[];
  busy: boolean;
  onRestore: (id: string) => void;
}) {
  if (!records.length) return null;
  return (
    <Panel className="skill-history" padding="none">
      <Disclosure
        title={
          <>
            <Clock3 size={16} /> 操作记录（{records.length}）
          </>
        }
        open
      >
        {records.map((record) => (
          <div className="skill-history-row" key={record.id}>
            <div>
              <strong>
                {record.name} · {skillActions[record.action]}
              </strong>
              <span>{record.restored ? '已恢复原入口' : record.message}</span>
              <small>{new Date(record.checked_at).toLocaleString()}</small>
              {record.backup && !record.restored && (
                <code>备份：{record.backup}</code>
              )}
            </div>
            {record.can_restore && (
              <Button
                size="small"
                disabled={busy}
                onClick={() => onRestore(record.id)}
              >
                恢复原入口
              </Button>
            )}
          </div>
        ))}
      </Disclosure>
    </Panel>
  );
}
