import { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { request } from '../lib/api';
import type {
  EnvironmentSettings,
  ProxyConfig,
} from '../lib/environment-settings';
import type { ProxyCommand, ProxyConfiguration } from '../lib/proxy-config';
import {
  Button,
  BusyState,
  ChoiceGroup,
  ContentDialog,
  Disclosure,
  Field,
  Notice,
  Select,
  TextArea,
  TextInput,
} from './ui';
import { ProxyDetails } from './proxy-details';

type Imported = {
  token: string;
  subscription_url: string;
  nodes: { index: number; name: string; type: string; server: string }[];
};

export function ProxyEditor({
  item,
  data,
  locked = false,
  busy,
  onSaveExternal,
  onCommand,
  onClose,
  onSaved,
}: {
  item?: ProxyConfig;
  data: EnvironmentSettings;
  locked?: boolean;
  busy: boolean;
  onSaveExternal: (item: ProxyConfig) => Promise<void>;
  onCommand: ProxyCommand;
  onClose: () => void;
  onSaved: () => void;
}) {
  const managed = data.proxy_runtime?.entries.find(
    (row) => row.id === item?.id,
  );
  const [mode, setMode] = useState<'external' | 'managed'>(
    item ? item.kind || 'external' : 'managed',
  );
  const [name, setName] = useState(item?.name || '');
  const [url, setUrl] = useState(item?.url || '');
  const [source, setSource] = useState(managed?.subscription?.url || '');
  const initialSource = useRef(source);
  const [configuration, setConfiguration] = useState('');
  const [loading, setLoading] = useState(item?.kind === 'managed');
  const [retry, setRetry] = useState(0);
  const [interval, setInterval] = useState(
    String(managed?.subscription?.interval_hours ?? 6),
  );
  const [imported, setImported] = useState<Imported>();
  const [index, setIndex] = useState('0');
  const originalDomains = (
    managed?.direct_domains || ['sankuai.com', 'meituan.com', 'meituan.net']
  ).join('\n');
  const [domains, setDomains] = useState(originalDomains);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const subscriptionUrl = managed?.subscription?.url || '';

  useEffect(() => {
    if (!item || item.kind !== 'managed') return;
    let active = true;
    setLoading(true);
    setError('');
    void request<ProxyConfiguration>('/api/proxy-services/config', {
      id: item.id,
    })
      .then((result) => {
        if (!active) return;
        const previous = initialSource.current;
        const next = subscriptionUrl || result.source;
        setSource((current) => (current === previous ? next : current));
        initialSource.current = next;
        setConfiguration(result.configuration);
      })
      .catch((reason) => {
        if (active) setError(String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    item?.id,
    item?.kind,
    subscriptionUrl,
    managed?.subscription?.last_updated,
    retry,
  ]);

  const sourceChanged = source.trim() !== initialSource.current.trim();
  const dirty =
    !item ||
    name !== item.name ||
    url !== item.url ||
    sourceChanged ||
    domains !== originalDomains ||
    interval !== String(managed?.subscription?.interval_hours ?? 6) ||
    !!imported;
  const requiresImport = !item || sourceChanged;
  const canSave =
    !pending &&
    !busy &&
    !locked &&
    dirty &&
    !loading &&
    (mode === 'external' ||
      (!!data.proxy_runtime?.core.available &&
        (!requiresImport || !!imported)));
  const operation = async (work: () => Promise<unknown>) => {
    setPending(true);
    setError('');
    try {
      await work();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setPending(false);
    }
  };
  const parse = () =>
    operation(async () => {
      const result = await request<Imported>(
        '/api/proxy-services/parse',
        {},
        { source },
      );
      setImported(result);
      if (result.subscription_url && interval === '0' && !managed?.subscription)
        setInterval('6');
      const selected = result.nodes.find(
        (row) => row.name === managed?.node?.name,
      );
      setIndex(String(selected?.index ?? result.nodes[0].index));
      if (!name) setName(result.nodes[0].name);
    });
  const save = () =>
    operation(async () => {
      if (mode === 'external') {
        await onSaveExternal({ id: item?.id || '', name, url });
      } else {
        await onCommand('save', {
          ...(item ? { id: item.id } : {}),
          name,
          ...(imported ? { token: imported.token, index: Number(index) } : {}),
          interval_hours: (
            imported ? imported.subscription_url : subscriptionUrl
          )
            ? Number(interval)
            : 0,
          direct_domains: domains
            .split(/[\n,，]/)
            .map((row) => row.trim())
            .filter(Boolean),
        });
      }
      onSaved();
    });
  return (
    <ContentDialog
      title={item ? '代理配置' : '添加代理'}
      className="proxy-config-dialog"
      busy={pending || busy}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) void save();
      }}
      footer={
        <>
          <Button disabled={pending || busy} onClick={onClose}>
            {locked || (item && !dirty) ? '关闭' : '取消'}
          </Button>
          <Button type="submit" variant="primary" disabled={!canSave}>
            {pending
              ? '处理中…'
              : item
                ? '保存配置'
                : mode === 'managed'
                  ? '创建并启动'
                  : '添加代理'}
          </Button>
        </>
      }
    >
      {item && <ProxyDetails item={item} service={managed} />}
      {locked && (
        <Notice>
          此代理正在被环境使用，停止相关浏览器或 App 后即可修改配置。
        </Notice>
      )}
      {loading && !configuration ? (
        <BusyState label="正在读取已保存的代理配置" />
      ) : item?.kind === 'managed' && !configuration ? (
        <Notice
          tone="error"
          action={
            <Button onClick={() => setRetry((value) => value + 1)}>
              重新读取
            </Button>
          }
        >
          {error || '未取得已保存的代理配置'}
        </Notice>
      ) : (
        <fieldset className="proxy-editor-fields" disabled={pending || busy}>
          {!item && (
            <ChoiceGroup
              label="代理来源"
              value={mode}
              onChange={setMode}
              items={[
                { value: 'managed', label: '创建专用代理' },
                { value: 'external', label: '已有代理地址' },
              ]}
            />
          )}
          <Field label="名称" htmlFor="proxy-name">
            <TextInput
              id="proxy-name"
              required
              maxLength={120}
              value={name}
              readOnly={locked}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          {mode === 'managed' && (
            <>
              <Field label="订阅链接或 Clash 配置" htmlFor="proxy-source">
                <TextArea
                  id="proxy-source"
                  className={`proxy-config-source ${source.startsWith('http') && !source.includes('\n') ? 'proxy-subscription-source' : ''}`}
                  value={source}
                  readOnly={locked}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="粘贴订阅链接，或 YAML / JSON 配置"
                  onChange={(event) => {
                    setSource(event.target.value);
                    setImported(undefined);
                  }}
                />
              </Field>
              <div className="proxy-import-actions">
                <input
                  ref={file}
                  type="file"
                  accept=".yaml,.yml,.json,.txt"
                  hidden
                  onChange={(event) => {
                    const selected = event.target.files?.[0];
                    if (selected)
                      void operation(async () => {
                        if (selected.size > 1_000_000)
                          throw new Error('配置文件不能超过 1 MB');
                        setSource(await selected.text());
                        setImported(undefined);
                      });
                    event.target.value = '';
                  }}
                />
                <Button disabled={locked} onClick={() => file.current?.click()}>
                  <Upload size={16} />
                  导入配置文件
                </Button>
                <Button
                  disabled={locked || !source.trim()}
                  onClick={() => void parse()}
                >
                  读取节点
                </Button>
              </div>
              {imported && (
                <Field label="选择节点">
                  <Select
                    value={index}
                    label="代理节点"
                    disabled={locked}
                    onChange={(next) => {
                      setIndex(next);
                      if (!item) setName(imported.nodes[Number(next)].name);
                    }}
                    options={imported.nodes.map((row) => ({
                      value: String(row.index),
                      label: row.name + ' · ' + row.type,
                    }))}
                  />
                </Field>
              )}
              {(imported ? imported.subscription_url : subscriptionUrl) && (
                <Field label="订阅自动更新">
                  <Select
                    label="订阅自动更新"
                    value={interval}
                    onChange={setInterval}
                    disabled={locked}
                    options={[
                      { value: '1', label: '每小时' },
                      { value: '6', label: '每 6 小时' },
                      { value: '24', label: '每天' },
                      { value: '0', label: '关闭' },
                    ]}
                  />
                </Field>
              )}
              <Field label="直连域名" htmlFor="proxy-direct-domains">
                <TextArea
                  id="proxy-direct-domains"
                  className="proxy-direct-domains"
                  value={domains}
                  readOnly={locked}
                  spellCheck={false}
                  placeholder="每行一个域名，例如 company.com"
                  onChange={(event) => setDomains(event.target.value)}
                />
              </Field>
            </>
          )}
          {mode === 'external' && (
            <Field label="代理地址" htmlFor="proxy-url">
              <TextInput
                id="proxy-url"
                value={url}
                readOnly={locked}
                required
                autoComplete="off"
                placeholder="http://127.0.0.1:7890 或 socks5://服务器:端口"
                onChange={(event) => setUrl(event.target.value)}
              />
            </Field>
          )}
          {error && <Notice tone="error">{error}</Notice>}
        </fieldset>
      )}
      {configuration && (
        <Disclosure title="实际运行配置">
          <TextArea
            className="proxy-runtime-config"
            value={configuration}
            readOnly
            aria-label="实际运行配置"
            spellCheck={false}
          />
        </Disclosure>
      )}
    </ContentDialog>
  );
}
