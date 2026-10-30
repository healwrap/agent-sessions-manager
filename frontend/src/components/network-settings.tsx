import { useState } from 'react';
import {
  ExternalLink,
  Network,
  RefreshCw,
  RotateCcw,
  ScanLine,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  ClashNetwork,
  EnvironmentSettings,
  ProxyConfig,
} from '../lib/environment-settings';
import { request } from '../lib/api';
import { errorMessage } from '../lib/error-message';
import {
  Button,
  CollectionPanel,
  CollectionToolbar,
  Disclosure,
  FactsGrid,
  Field,
  Notice,
  ResourceCard,
  SectionHeading,
  StatusBadge,
  TextInput,
  toast,
} from './ui';
import {
  IntranetEditor,
  NetworkConnectionEditor,
  NetworkLineEditor,
} from './network-editors';
import clashVergeIcon from '../assets/components/clash-verge.png';
import '../styles/network-settings.css';
import { NetworkLines } from './network-lines';
import { NetworkControls } from './network-controls';
import type { NodeEnvironmentEdit } from './network-node-delete';

const empty: ClashNetwork = {
  connected: false,
  version: '',
  tun: false,
  mode: '',
  error: '',
  endpoint: '',
  secret_set: false,
  group: '',
  current_node: '',
  nodes: [],
  routing_ready: false,
  domains: [],
  dns: [],
};

export function NetworkSettings({
  data,
  busy,
  creating,
  onCloseCreate,
  onReload,
  onInspect,
  onDelete,
  onSavedProxy,
  onEditEnvironment,
}: {
  data: EnvironmentSettings;
  busy: boolean;
  creating: boolean;
  onCloseCreate: () => void;
  onReload: () => Promise<void>;
  onInspect: (item: ProxyConfig) => void;
  onDelete: (id: string) => void;
  onSavedProxy: (item: ProxyConfig) => void;
  onEditEnvironment: (edit: NodeEnvironmentEdit) => void;
}) {
  const network = data.network || empty;
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<ProxyConfig>();
  const [dialog, setDialog] = useState<'connection' | 'intranet'>();
  const [working, setWorking] = useState(false);
  const [loadingControl, setLoadingControl] = useState<string>();
  const [host, setHost] = useState('');
  const lines = data.proxies.filter((row) => row.kind === 'clash');
  const pending = working || busy;
  const locked = [...data.browser.runs, ...data.app_runtime.runs].some(
    (row) => row.alive || row.status === 'checking',
  );
  const run = async (action: string, body: unknown = {}, control?: string) => {
    setWorking(true);
    setLoadingControl(control);
    try {
      await request('/api/network/' + action, {}, body);
      await onReload();
    } catch (reason) {
      toast(errorMessage(reason), { tone: 'error' });
    } finally {
      setWorking(false);
      setLoadingControl(undefined);
    }
  };
  const testIntranet = async () => {
    setWorking(true);
    try {
      const value = await request<{ addresses: string[] }>(
        '/api/network/intranet',
        {},
        { host },
      );
      toast('解析和连接正常 · ' + value.addresses.join('、'), {
        tone: 'success',
        holdMs: 5000,
      });
    } catch (reason) {
      toast(errorMessage(reason), { tone: 'error' });
    } finally {
      setWorking(false);
    }
  };
  const saved = () => {
    setDialog(undefined);
    void onReload();
  };
  return (
    <section className="network-settings" aria-label="网络设置">
      <ResourceCard
        title="Clash Verge"
        className="network-clash"
        icon={<img src={clashVergeIcon} width={32} height={32} alt="" />}
        subtitle={
          network.connected
            ? network.tun
              ? 'TUN 已开启'
              : 'TUN 未开启'
            : '连接本机 Clash Verge'
        }
        badge={
          <StatusBadge tone={network.connected ? 'success' : 'neutral'}>
            {network.connected ? '已连接' : '未连接'}
          </StatusBadge>
        }
        actions={
          <>
            <Button disabled={pending} onClick={() => void run('refresh')}>
              <RefreshCw size={16} />
              刷新
            </Button>
            <Button disabled={pending} onClick={() => void run('open')}>
              <ExternalLink size={16} />
              打开 Clash
            </Button>
            <Button disabled={pending} onClick={() => setDialog('connection')}>
              <SlidersHorizontal size={16} />
              连接设置
            </Button>
          </>
        }
      >
        {network.error && <Notice tone="warning">{network.error}</Notice>}
        {network.connected && network.mode !== 'rule' && (
          <Notice tone="warning">请将 Clash Verge 切换到规则模式。</Notice>
        )}
        {network.connected &&
          !network.tun &&
          network.auto_prepare === false && (
            <Notice tone="warning">
              请在 Clash Verge 开启 TUN，再启动账号环境。
            </Notice>
          )}
        {network.connected &&
          network.routing_active &&
          !!lines.length &&
          !network.routing_ready && (
            <Notice
              tone="warning"
              action={
                <Button
                  disabled={pending}
                  onClick={() =>
                    void run('apply', {
                      domains: network.domains,
                      dns: network.dns,
                    })
                  }
                >
                  应用分流
                </Button>
              }
            >
              账号分流规则未生效
            </Notice>
          )}
        <NetworkControls
          network={network}
          pending={pending}
          locked={locked}
          loadingControl={loadingControl}
          onChange={(name, enabled) =>
            void run('control', { name, enabled }, name)
          }
        />
        {network.restore_error && (
          <Notice tone="warning">{network.restore_error}</Notice>
        )}
        <Disclosure title="Clash 连接信息" compact>
          <FactsGrid
            items={[
              { label: '内核版本', value: network.version || '未取得' },
              {
                label: '连接方式',
                value: network.connected
                  ? (network.controller || network.endpoint).startsWith('http')
                    ? '本机 HTTP 接口'
                    : (network.controller || '').startsWith('\\\\.\\pipe\\')
                      ? '本机命名管道'
                      : '本机服务'
                  : '未连接',
              },
              {
                label: '接口认证',
                value:
                  network.secret_source === 'auto'
                    ? '自动读取本机密钥'
                    : network.secret_source === 'manual'
                      ? '使用保存的密钥'
                      : '未配置密钥',
              },
              { label: '当前订阅', value: network.profile?.name || '未取得' },
            ]}
          />
          <Button
            disabled={pending || locked || !lines.length}
            onClick={() =>
              void (network.routing_active
                ? run('reset')
                : run('apply', { domains: network.domains, dns: network.dns }))
            }
          >
            <RotateCcw size={16} />
            {network.routing_active ? '停用分流并恢复原配置' : '启用账号分流'}
          </Button>
        </Disclosure>
      </ResourceCard>
      <CollectionPanel
        toolbar={
          <CollectionToolbar
            query={query}
            onQuery={setQuery}
            searchLabel="搜索 Claude 节点"
          >
            <SectionHeading title="Claude 专用节点" />
          </CollectionToolbar>
        }
      >
        <NetworkLines
          data={data}
          query={query}
          busy={pending}
          onEdit={setEditing}
          onInspect={onInspect}
          onDelete={onDelete}
          onEditEnvironment={onEditEnvironment}
        />
      </CollectionPanel>
      <ResourceCard
        title="直连配置"
        icon={<Network size={22} />}
        subtitle={
          network.domains.length ? network.domains.join('、') : '未配置直连域名'
        }
        actions={
          <Button disabled={pending} onClick={() => setDialog('intranet')}>
            <SlidersHorizontal size={16} />
            配置
          </Button>
        }
      >
        {!!network.dns.length && (
          <p className="network-bound-accounts">
            DNS 服务器 · {network.dns.join('、')}
          </p>
        )}
        {!!network.domains.length && (
          <div className="network-intranet-test">
            <Field label="检测域名" htmlFor="network-intranet-host">
              <TextInput
                id="network-intranet-host"
                value={host}
                onChange={(event) => setHost(event.target.value)}
                placeholder="输入已配置的直连域名"
              />
            </Field>
            <Button
              disabled={pending || !host.trim()}
              onClick={() => void testIntranet()}
            >
              <ScanLine size={16} />
              检测
            </Button>
          </div>
        )}
      </ResourceCard>
      {(creating || editing) && (
        <NetworkLineEditor
          item={editing}
          existingIds={data.proxies.map((row) => row.id)}
          locked={locked}
          onClose={() => {
            setEditing(undefined);
            onCloseCreate();
          }}
          onSaved={(latest, id) => {
            setEditing(undefined);
            onCloseCreate();
            void onReload();
            onSavedProxy(latest.proxies.find((row) => row.id === id)!);
          }}
        />
      )}
      {dialog === 'connection' && (
        <NetworkConnectionEditor
          locked={locked}
          network={network}
          onClose={() => setDialog(undefined)}
          onSaved={saved}
        />
      )}
      {dialog === 'intranet' && (
        <IntranetEditor
          locked={locked}
          network={network}
          onClose={() => setDialog(undefined)}
          onSaved={saved}
        />
      )}
    </section>
  );
}
