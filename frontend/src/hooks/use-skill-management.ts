import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '../lib/api';
import type { SkillInventory } from '../lib/skill-management';
import { toast } from '../components/ui/toast';

export function useSkillManagement(active: boolean) {
  const [data, setData] = useState<SkillInventory>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const revision = useRef(0);
  const reload = useCallback(async () => {
    const version = ++revision.current;
    setLoading(true);
    setError('');
    try {
      const next = await request<SkillInventory>('/api/skills');
      if (version === revision.current) setData(next);
    } catch (reason) {
      if (version === revision.current) setError(String(reason));
    } finally {
      if (version === revision.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (active) void reload();
  }, [active, reload]);
  async function mutate(path: string, body: unknown) {
    revision.current++;
    setBusy(true);
    setError('');
    try {
      const next = await request<SkillInventory>(path, {}, body);
      setData(next);
      const failures = next.results?.filter((row) => !row.success) || [];
      if (failures.length)
        toast(failures.map((row) => `${row.name}：${row.message}`).join('；'), {
          tone: 'error',
        });
      else
        toast(
          next.results
            ? `已完成 ${next.results.length} 个入口的操作。`
            : '已恢复原安装入口',
          { tone: 'success' },
        );
      return !failures.length;
    } catch (reason) {
      toast(String(reason), { tone: 'error' });
      throw reason;
    } finally {
      revision.current++;
      setBusy(false);
      setLoading(false);
    }
  }
  return { data, loading, busy, error, reload, mutate };
}
