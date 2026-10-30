import type { ClashNetwork } from '../lib/environment-settings';
import { SettingsRow } from './settings/row';
import { Notice, Switch } from './ui';

export function NetworkControls({
  network,
  pending,
  locked,
  onChange,
}: {
  network: ClashNetwork;
  pending: boolean;
  locked: boolean;
  onChange: (name: string, enabled: boolean) => void;
}) {
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
          disabled={pending}
          onChange={(value) => onChange('auto_prepare', value)}
        />
      </SettingsRow>
      {locked && (
        <p className="network-bound-accounts">停止账号环境后可修改网络开关。</p>
      )}
      {network.system_proxy?.error && (
        <Notice tone="warning">{network.system_proxy.error}</Notice>
      )}
    </div>
  );
}
