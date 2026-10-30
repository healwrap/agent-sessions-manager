import { useState } from 'react';
import type {
  ClashNetwork,
  EnvironmentSettings,
  ProxyConfig,
} from '../lib/environment-settings';
import { request } from '../lib/api';
import { errorMessage } from '../lib/error-message';
import {
  Button,
  ContentDialog,
  Field,
  Notice,
  Select,
  TextArea,
  TextInput,
} from './ui';

export function NetworkLineEditor({
  item,
  existingIds,
  locked = false,
  onClose,
  onSaved,
}: {
  item?: ProxyConfig;
  existingIds: string[];
  locked?: boolean;
  onClose: () => void;
  onSaved: (data: EnvironmentSettings, id: string) => void;
}) {
  const [name, setName] = useState(item?.name || '');
  const [format, setFormat] = useState(item?.node ? 'config' : 'address');
  const [address, setAddress] = useState('');
  const [nodeConfig, setNodeConfig] = useState(
    item?.node
      ? JSON.stringify({ ...item.node, name: undefined }, null, 2)
      : '',
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (locked) return;
    setPending(true);
    setError('');
    try {
      const data = await request<EnvironmentSettings>(
        '/api/network/save-line',
        {},
        {
          id: item?.id,
          name,
          ...(format === 'address' ? { address } : { node_yaml: nodeConfig }),
        },
      );
      const saved = data.proxies.find(
        (row) =>
          row.kind === 'clash' &&
          row.name === name.trim() &&
          (item ? row.id === item.id : !existingIds.includes(row.id)),
      );
      onSaved(data, saved!.id);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPending(false);
    }
  };
  return (
    <ContentDialog
      title={item ? '配置 Claude 节点' : '添加 Claude 节点'}
      guide="proxy-editor"
      busy={pending}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            取消
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={
              pending ||
              locked ||
              !name.trim() ||
              !(format === 'address' ? address.trim() : nodeConfig.trim())
            }
          >
            保存节点
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {locked && <Notice>停止运行中的环境后可修改配置。</Notice>}
      <Field label="节点名称" htmlFor="network-line-name">
        <TextInput
          disabled={locked}
          id="network-line-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </Field>
      <Field label="配置方式">
        <Select
          disabled={locked}
          label="节点配置方式"
          value={format}
          onChange={setFormat}
          options={[
            { value: 'address', label: 'HTTP / SOCKS5 地址' },
            { value: 'config', label: '单节点 YAML / JSON' },
          ]}
        />
      </Field>
      {format === 'address' ? (
        <Field label="代理地址" htmlFor="network-node-address">
          <TextInput
            disabled={locked}
            id="network-node-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="socks5://用户名:密码@服务器:端口"
            autoComplete="off"
            required
          />
        </Field>
      ) : (
        <Field label="单节点配置" htmlFor="network-node-config">
          <TextArea
            disabled={locked}
            id="network-node-config"
            value={nodeConfig}
            onChange={(event) => setNodeConfig(event.target.value)}
            placeholder={
              'type: socks5\nserver: proxy.example.com\nport: 1080\nusername: user\npassword: password'
            }
            rows={8}
          />
        </Field>
      )}
      <p className="network-bound-accounts">仅保存此节点，不导入或更新订阅。</p>
    </ContentDialog>
  );
}

export function NetworkConnectionEditor({
  network,
  locked = false,
  onClose,
  onSaved,
}: {
  network: ClashNetwork;
  locked?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [endpoint, setEndpoint] = useState(network.endpoint);
  const [secret, setSecret] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (locked) return;
    setPending(true);
    setError('');
    try {
      await request('/api/network/connect', {}, { endpoint, secret });
      onSaved();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPending(false);
    }
  };
  return (
    <ContentDialog
      title="连接 Clash Verge"
      busy={pending}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            取消
          </Button>
          <Button type="submit" variant="primary" disabled={pending || locked}>
            连接
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {locked && <Notice>停止运行中的环境后可修改配置。</Notice>}
      <Field label="控制接口" htmlFor="network-endpoint">
        <TextInput
          disabled={locked}
          id="network-endpoint"
          value={endpoint}
          onChange={(event) => setEndpoint(event.target.value)}
          placeholder="留空自动连接本机 Clash Verge"
        />
      </Field>
      <Field label="接口密钥" htmlFor="network-secret">
        <TextInput
          disabled={locked}
          id="network-secret"
          type="password"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          placeholder={
            network.secret_set
              ? '已保存，留空保留'
              : '留空从本机 Clash 配置自动读取'
          }
          autoComplete="off"
        />
      </Field>
    </ContentDialog>
  );
}

export function IntranetEditor({
  network,
  locked = false,
  onClose,
  onSaved,
}: {
  network: ClashNetwork;
  locked?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [domains, setDomains] = useState(network.domains.join('\n'));
  const [dns, setDns] = useState(network.dns.join('\n'));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const values = (text: string) =>
    text
      .split(/[\n,，]/)
      .map((value) => value.trim())
      .filter(Boolean);
  const save = async () => {
    if (locked) return;
    setPending(true);
    setError('');
    try {
      await request(
        '/api/network/apply',
        {},
        { domains: values(domains), dns: values(dns) },
      );
      onSaved();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPending(false);
    }
  };
  return (
    <ContentDialog
      title="直连配置"
      busy={pending}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      footer={
        <>
          <Button disabled={pending} onClick={onClose}>
            取消
          </Button>
          <Button type="submit" variant="primary" disabled={pending || locked}>
            应用配置
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {locked && <Notice>停止运行中的环境后可修改配置。</Notice>}
      <Field label="直连域名" htmlFor="intranet-domains">
        <TextArea
          disabled={locked}
          id="intranet-domains"
          value={domains}
          onChange={(event) => setDomains(event.target.value)}
          placeholder="每行一个域名，例如 example.com"
          rows={3}
        />
      </Field>
      <Field label="直连 DNS（可选）" htmlFor="intranet-dns">
        <TextArea
          disabled={locked}
          id="intranet-dns"
          value={dns}
          onChange={(event) => setDns(event.target.value)}
          placeholder="每行一个 IP 地址，留空使用 Clash 现有 DNS"
          rows={2}
        />
      </Field>
      <p className="network-bound-accounts">
        国内网站和直连请求使用这些 DNS，留空使用 Clash 现有配置。
      </p>
    </ContentDialog>
  );
}
