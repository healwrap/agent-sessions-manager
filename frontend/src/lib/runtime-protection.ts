import type {
  BrowserAccount,
  BrowserRun,
  ClashNetwork,
  ProxyConfig,
} from './environment-settings';

export type RuntimeProtectionState = 'active' | 'pending';

export function runtimeProtection(
  provider: BrowserAccount['provider'],
  run:
    | Pick<BrowserRun, 'status' | 'alive' | 'error' | 'checks' | 'route'>
    | undefined,
  proxy: Pick<ProxyConfig, 'kind' | 'clash_node'> | undefined,
  network:
    | Pick<
        ClashNetwork,
        | 'connected'
        | 'tun'
        | 'mode'
        | 'routing_ready'
        | 'current_node'
        | 'error'
      >
    | undefined,
): RuntimeProtectionState | undefined {
  if (provider !== 'claude' || run?.status !== 'running' || !run.alive)
    return undefined;
  const checksPassed = !run.checks.some(
    (check) =>
      check.policy === 'block' &&
      check.state !== 'pass' &&
      check.state !== 'skip',
  );
  return !run.error &&
    checksPassed &&
    proxy?.kind === 'clash' &&
    !!proxy.clash_node &&
    network?.connected &&
    !network.error &&
    network.tun &&
    network.mode === 'rule' &&
    network.routing_ready &&
    network.current_node === (run.route?.clash_node || proxy.clash_node)
    ? 'active'
    : 'pending';
}
