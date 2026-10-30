import { useEffect, useRef } from 'react';
import type { ClashNetwork } from '../lib/environment-settings';
import { SettingsRow } from './settings/row';
import { dismissToast, Switch, toast } from './ui';

export function NetworkControls({
  network,
  pending,
  locked,
  loadingControl,
  onChange,
}: {
  network: ClashNetwork;
  pending: boolean;
  locked: boolean;
  loadingControl?: string;
  onChange: (name: string, enabled: boolean) => void;
}) {
  const warning = useRef<{ text: string; sequence: number } | null>(null);
  const proxy = network.system_proxy;
  const message =
    proxy?.error ||
    (network.connected &&
    typeof proxy?.clash_configured === 'boolean' &&
    typeof proxy.enabled === 'boolean' &&
    proxy.clash_configured !== proxy.enabled
      ? `本机系统代理${proxy.enabled ? '已开启' : '已关闭'}，Clash 设置仍为${proxy.clash_configured ? '开启' : '关闭'}。请在 Clash 中同步开关。`
      : '');
  useEffect(() => {
    if (warning.current?.text === message) return;
    if (warning.current) dismissToast(warning.current.sequence);
    warning.current = message
      ? { text: message, sequence: toast(message, { tone: 'warning' }) }
      : null;
  }, [message]);
  return (
    <div className="network-controls">
      <SettingsRow
        label="系统代理"
        description="让使用系统代理的应用通过 Clash 联网。"
        htmlFor="network-system-proxy"
      >
        <Switch
          id="network-system-proxy"
          label="系统代理"
          checked={network.system_proxy?.enabled === true}
          loading={loadingControl === 'system_proxy'}
          disabled={
            pending ||
            locked ||
            !network.system_proxy?.supported ||
            network.system_proxy.enabled === null
          }
          onChange={(value) => onChange('system_proxy', value)}
        />
      </SettingsRow>
      <SettingsRow
        label="TUN 模式"
        description="由 Clash 接管网络连接，账号环境需要开启。"
        htmlFor="network-tun"
      >
        <Switch
          id="network-tun"
          label="TUN 模式"
          checked={network.tun}
          loading={loadingControl === 'tun'}
          disabled={pending || locked}
          onChange={(value) => onChange('tun', value)}
        />
      </SettingsRow>
      <SettingsRow
        label="启动时自动准备网络"
        description="打开 Clash、开启 TUN 并准备账号分流；系统代理保持手动设置。"
        htmlFor="network-auto-prepare"
      >
        <Switch
          id="network-auto-prepare"
          label="启动时自动准备网络"
          checked={network.auto_prepare !== false}
          loading={loadingControl === 'auto_prepare'}
          disabled={pending}
          onChange={(value) => onChange('auto_prepare', value)}
        />
      </SettingsRow>
      {locked && (
        <p className="network-bound-accounts">停止账号环境后可修改网络开关。</p>
      )}
    </div>
  );
}
