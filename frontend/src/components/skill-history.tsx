import { Clock3 } from 'lucide-react';
import type { SkillRecord } from '../lib/skill-management';
import { skillActions } from '../lib/skill-management';
import { Button } from './primitives';

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
    <details className="skill-history" open>
      <summary>
        <Clock3 size={14} />
        操作记录 <span>{records.length}</span>
      </summary>
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
    </details>
  );
}
