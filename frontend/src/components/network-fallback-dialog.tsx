import { useState } from 'react';
import type { EnvironmentSettings } from '../lib/environment-settings';
import { fallbackChain } from '../lib/network-fallback';
import { request } from '../lib/api';
import { errorMessage } from '../lib/error-message';
import { Button, ContentDialog, Notice, toast } from './ui';
import type { FallbackSwitch } from './network-fallback-status';

export function NetworkFallbackDialog({
  value,
  data,
  onClose,
  onSaved,
}: {
  value: FallbackSwitch;
  data: EnvironmentSettings;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, setPending] = useState(false);
  const status = data.network?.fallbacks?.find(
    (row) => row.id === value.item.id,
  );
  const chain = fallbackChain(data.proxies, value.item.id);
  const index = Math.max(
    0,
    chain.findIndex((row) => row.id === status?.current_id),
  );
  const candidates =
    value.target === 'primary' ? chain.slice(0, 1) : chain.slice(index + 1);
  const profiles = [...data.profiles, ...data.app_profiles].filter(
    (row) => row.proxy_id === value.item.id,
  );
  const active = profiles.filter((row) =>
    [...data.browser.runs, ...data.app_runtime.runs].some(
      (run) =>
        run.profile_id === row.id && (run.alive || run.status === 'checking'),
    ),
  );
  const submit = async () => {
    setPending(true);
    try {
      await request(
        '/api/network/fallback-switch',
        {},
        { id: value.item.id, target: value.target },
      );
      onSaved();
      toast('正在检测并切换节点，请留意运行状态。');
    } catch (reason) {
      toast(errorMessage(reason), { tone: 'error' });
    } finally {
      setPending(false);
    }
  };
  return (
    <ContentDialog
      title={value.target === 'primary' ? '切回主节点' : '按顺序回退'}
      busy={pending}
      onClose={onClose}
      footer={
        <>
          <Button disabled={pending} onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            disabled={pending || !candidates.length}
            onClick={() => void submit()}
          >
            检测并切换
          </Button>
        </>
      }
    >
      <p>依次检测：{candidates.map((row) => row.name).join(' → ')}</p>
      <p>仅切到通过出口和地区检查的节点；全部不可用时保留当前线路。</p>
      {active.length > 0 ? (
        <Notice tone="warning">
          切换会重启 {active.map((row) => row.name).join('、')}
          ，当前响应会中断，登录和会话数据保留。
        </Notice>
      ) : (
        <p>下次启动使用切换后的节点。成功后不会自动回到主节点。</p>
      )}
    </ContentDialog>
  );
}
