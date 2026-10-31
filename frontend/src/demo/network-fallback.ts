import type { EnvironmentSettings } from '../lib/environment-settings';
import { fallbackChain } from '../lib/network-fallback';

export function refreshFallbacks(data: EnvironmentSettings) {
  const previous = data.network!.fallbacks || [];
  data.network!.fallbacks = data.proxies
    .filter((row) => row.fallback_ids?.length)
    .map((row) => {
      const chain = fallbackChain(data.proxies, row.id).map((node) => node.id);
      const old = previous.find((item) => item.id === row.id);
      return {
        ...old,
        id: row.id,
        chain,
        switching: old?.switching || false,
        current_id:
          old && chain.includes(old.current_id) ? old.current_id : row.id,
      };
    });
}

export function demoFallback(
  data: EnvironmentSettings,
  value: { id: string; target: string },
) {
  refreshFallbacks(data);
  const root = data.proxies.find((row) => row.id === value.id);
  const status = data.network!.fallbacks!.find((row) => row.id === value.id);
  if (!root || !status) throw new Error('请先配置备用节点');
  const chain = fallbackChain(data.proxies, root.id);
  const index = chain.findIndex((row) => row.id === status.current_id);
  const chosen = value.target === 'primary' ? chain[0] : chain[index + 1];
  if (!chosen) throw new Error('已经是回退链的最后一个节点');
  status.current_id = chosen.id;
  status.switching = true;
  status.message = '正在检测并重启示例环境';
  setTimeout(() => {
    status.switching = false;
    status.state = chosen.id === root.id ? 'healthy' : 'backup';
    status.message = '已切换至' + chosen.name;
    for (const run of [...data.browser.runs, ...data.app_runtime.runs]) {
      const profile = [...data.profiles, ...data.app_profiles].find(
        (row) => row.id === run.profile_id,
      );
      if (profile?.proxy_id !== root.id || !run.alive) continue;
      run.route = {
        root_id: root.id,
        proxy_id: chosen.id,
        root_name: root.name,
        proxy_name: chosen.name,
        clash_node: chosen.clash_node,
        backup: chosen.id !== root.id,
        attempts: [],
      };
      data.network!.current_node = chosen.clash_node;
    }
  }, 900);
  return data;
}
