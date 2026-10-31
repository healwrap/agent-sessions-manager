import { useState } from 'react';
import {
  Monitor,
  PanelsTopLeft,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import type {
  AppProfile,
  BrowserProfile,
  EnvironmentSettings,
  ProxyConfig,
} from '../lib/environment-settings';
import { Button, ContentDialog, Notice, ResourceRow } from './ui';

export type NodeEnvironmentEdit =
  | { kind: 'profiles'; item: BrowserProfile }
  | { kind: 'app_profiles'; item: AppProfile };

export function NetworkNodeDelete({
  item,
  data,
  busy,
  onEditEnvironment,
  onDelete,
}: {
  item: ProxyConfig;
  data: EnvironmentSettings;
  busy: boolean;
  onEditEnvironment: (edit: NodeEnvironmentEdit) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const environments: NodeEnvironmentEdit[] = [
    ...data.profiles
      .filter((row) => row.proxy_id === item.id)
      .map((item) => ({ kind: 'profiles' as const, item })),
    ...data.app_profiles
      .filter((row) => row.proxy_id === item.id)
      .map((item) => ({ kind: 'app_profiles' as const, item })),
  ];
  const runs = [...data.browser.runs, ...data.app_runtime.runs];
  const parents = data.proxies.filter((row) =>
    row.fallback_ids?.includes(item.id),
  );
  const active = (id?: string) =>
    runs.some(
      (row) =>
        (!id || row.profile_id === id) &&
        (row.alive || row.status === 'checking'),
    );
  const inUse = environments.length > 0 || parents.length > 0;
  return (
    <>
      <Button
        aria-label={'删除节点 ' + item.name}
        title={
          busy
            ? '操作处理中，请稍后'
            : inUse
              ? '节点仍被环境使用，点击查看'
              : undefined
        }
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        <Trash2 size={16} />
        删除
      </Button>
      {open && (
        <ContentDialog
          title={inUse ? '节点仍在使用' : '删除 Claude 节点'}
          onClose={() => setOpen(false)}
          footer={
            <>
              <Button onClick={() => setOpen(false)}>
                {inUse ? '知道了' : '取消'}
              </Button>
              {!inUse && (
                <Button
                  className="ui-danger"
                  disabled={busy || active()}
                  title={active() ? '停止运行中的环境后可删除节点' : undefined}
                  onClick={() => {
                    onDelete(item.id);
                    setOpen(false);
                  }}
                >
                  <Trash2 size={16} />
                  确认删除
                </Button>
              )}
            </>
          }
        >
          {inUse ? (
            <>
              <Notice>
                “{item.name}”仍被环境或备用配置使用。请先解除引用，再删除。
              </Notice>
              {parents.length > 0 && (
                <p>
                  作为以下节点的备用：
                  {parents.map((row) => row.name).join('、')}
                  。请在节点配置中移除备用关系。
                </p>
              )}
              <div role="list">
                {environments.map((edit) => (
                  <ResourceRow
                    key={edit.kind + edit.item.id}
                    title={edit.item.name}
                    subtitle={
                      edit.kind === 'profiles'
                        ? '浏览器环境'
                        : 'Claude App 环境'
                    }
                    icon={
                      edit.kind === 'profiles' ? (
                        <PanelsTopLeft size={20} />
                      ) : (
                        <Monitor size={20} />
                      )
                    }
                    actions={
                      <Button
                        disabled={active(edit.item.id)}
                        title={
                          active(edit.item.id)
                            ? '停止此环境后可更换节点'
                            : undefined
                        }
                        onClick={() => {
                          setOpen(false);
                          onEditEnvironment(edit);
                        }}
                      >
                        <SlidersHorizontal size={16} />
                        配置环境
                      </Button>
                    }
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="ui-confirm-message">删除“{item.name}”？</p>
              {active() && <Notice>有环境正在运行。停止后可删除节点。</Notice>}
            </>
          )}
        </ContentDialog>
      )}
    </>
  );
}
