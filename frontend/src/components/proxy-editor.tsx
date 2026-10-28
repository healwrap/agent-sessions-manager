import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { request } from '../lib/api';
import type {
  EnvironmentSettings,
  ProxyConfig,
} from '../lib/environment-settings';
import {
  Button,
  ChoiceGroup,
  EditorDialog,
  Field,
  Notice,
  Select,
  TextArea,
  TextInput,
} from './ui';
import { ProxyCoreControl } from './proxy-core-control';

type Imported = {
  token: string;
  subscription_url: string;
  nodes: { index: number; name: string; type: string; server: string }[];
};
type Command = (
  action: 'install' | 'save' | 'start' | 'stop' | 'adopt',
  body?: unknown,
) => Promise<EnvironmentSettings>;

export function ProxyEditor({
  item,
  data,
  onSaveExternal,
  onCommand,
  onClose,
}: {
  item?: ProxyConfig;
  data: EnvironmentSettings;
  onSaveExternal: (item: ProxyConfig) => Promise<void>;
  onCommand: Command;
  onClose: () => void;
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
  const [interval, setInterval] = useState(
    String(managed?.subscription?.interval_hours ?? 6),
  );
  const [imported, setImported] = useState<Imported>();
  const [index, setIndex] = useState('0');
  const [domains, setDomains] = useState(
    (
      managed?.direct_domains || ['sankuai.com', 'meituan.com', 'meituan.net']
    ).join('\n'),
  );
  const [changing, setChanging] = useState(!managed?.node);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const file = useRef<HTMLInputElement>(null);
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
      setIndex('0');
      if (!name) setName(result.nodes[0].name);
    });
  const save = () =>
    operation(async () => {
      if (mode === 'external')
        await onSaveExternal({ id: item?.id || '', name, url });
      else
        await onCommand('save', {
          ...(item ? { id: item.id } : {}),
          name,
          ...(imported ? { token: imported.token, index: Number(index) } : {}),
          interval_hours: (
            imported ? imported.subscription_url : managed?.subscription?.url
          )
            ? Number(interval)
            : 0,
          direct_domains: domains
            .split(/[\n,，]/)
            .map((row) => row.trim())
            .filter(Boolean),
        });
      onClose();
    });
  return (
    <EditorDialog
      title={item ? '编辑代理' : '添加代理'}
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
            variant="primary"
            type="submit"
            disabled={
              pending ||
              (mode === 'managed' &&
                (!data.proxy_runtime?.core.available ||
                  (changing && !imported)))
            }
          >
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
      {mode === 'managed' && (
        <ProxyCoreControl
          state={data.proxy_runtime}
          busy={pending}
          onInstall={() => void operation(() => onCommand('install'))}
        />
      )}
      {mode === 'managed' && changing && (
        <>
          <Field label="订阅链接或 Clash 配置" htmlFor="proxy-source">
            <TextArea
              id="proxy-source"
              className="proxy-config-source"
              value={source}
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
            <Button onClick={() => file.current?.click()}>
              <Upload size={16} />
              导入配置文件
            </Button>
            <Button
              onClick={() => void parse()}
              disabled={!source.trim() || pending}
            >
              读取节点
            </Button>
          </div>
          {imported && (
            <Field label="选择节点">
              <Select
                value={index}
                label="代理节点"
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
        </>
      )}
      {mode === 'managed' && !changing && managed?.node && (
        <Field label="当前节点">
          <div className="proxy-import-actions">
            <span>{managed.node.name}</span>
            <Button onClick={() => setChanging(true)}>更换节点</Button>
          </div>
        </Field>
      )}
      <Field label="名称" htmlFor="proxy-name">
        <TextInput
          id="proxy-name"
          required
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      {mode === 'managed' &&
        (imported ? imported.subscription_url : managed?.subscription?.url) && (
          <Field label="订阅自动更新">
            <Select
              label="订阅自动更新"
              value={interval}
              onChange={setInterval}
              options={[
                { value: '1', label: '每小时' },
                { value: '6', label: '每 6 小时' },
                { value: '24', label: '每天' },
                { value: '0', label: '关闭' },
              ]}
            />
          </Field>
        )}
      {mode === 'external' ? (
        <Field label="代理地址" htmlFor="proxy-url">
          <TextInput
            id="proxy-url"
            value={url}
            required
            placeholder="http://127.0.0.1:7890 或 socks5://服务器:端口"
            autoComplete="off"
            onChange={(event) => setUrl(event.target.value)}
          />
        </Field>
      ) : (
        <Field label="直连域名" htmlFor="proxy-direct-domains">
          <TextArea
            id="proxy-direct-domains"
            className="proxy-direct-domains"
            value={domains}
            spellCheck={false}
            placeholder="每行一个域名，例如 company.com"
            onChange={(event) => setDomains(event.target.value)}
          />
        </Field>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </EditorDialog>
  );
}
