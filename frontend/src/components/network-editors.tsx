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
  network,
  locked = false,
  onClose,
  onSaved,
}: {
  item?: ProxyConfig;
  existingIds: string[];
  network: ClashNetwork;
  locked?: boolean;
  onClose: () => void;
  onSaved: (data: EnvironmentSettings, id: string) => void;
}) {
  const [name, setName] = useState(item?.name || '');
  const [node, setNode] = useState(item?.clash_node || '');
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
        { id: item?.id, name, node },
      );
      const saved = data.proxies.find(
        (row) =>
          row.kind === 'clash' &&
          row.name === name.trim() &&
          row.clash_node === node &&
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
      title={
        item
          ? item.kind === 'clash'
            ? '配置出口线路'
            : '迁移出口线路'
          : '添加出口线路'
      }
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
            disabled={pending || locked || !name.trim() || !node}
          >
            保存线路
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {locked && <Notice>停止运行中的环境后可修改配置。</Notice>}
      <Field label="线路名称" htmlFor="network-line-name">
        <TextInput
          disabled={locked}
          id="network-line-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </Field>
      <Field label="Clash 节点">
        <Select
          disabled={locked}
          label="出口节点"
          value={node}
          onChange={(value) => {
            setNode(value);
            if (!name) setName(value);
          }}
          options={[
            { value: '', label: '选择固定节点' },
            ...network.nodes.map((row) => ({
              value: row.name,
              label: row.name,
            })),
          ]}
        />
      </Field>
      {item && item.kind !== 'clash' && (
        <Notice>
          保存后，绑定此线路的账号将使用 Clash Verge；原环境与登录数据保留。
        </Notice>
      )}
      {!network.nodes.length && (
        <Notice>请先在 Clash Verge 导入节点配置，再刷新网络设置。</Notice>
      )}
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
              : '自动连接时从 Clash 配置读取'
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
      <Field label="DNS 服务器（可选）" htmlFor="intranet-dns">
        <TextArea
          disabled={locked}
          id="intranet-dns"
          value={dns}
          onChange={(event) => setDns(event.target.value)}
          placeholder="每行一个 IP 地址，留空使用 Clash 现有 DNS"
          rows={2}
        />
      </Field>
    </ContentDialog>
  );
}
