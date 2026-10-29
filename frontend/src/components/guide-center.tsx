import { useState } from 'react';
import type { WorkspacePage } from '../workspace';
import {
  guideStore,
  guideTopics,
  useGuide,
  type GuideTopic,
} from '../state/guide-store';
import { useEnvironmentSettings } from '../hooks/use-environment-settings';
import { accountGuide, proxyGuide } from '../lib/guide-links';
import {
  Button,
  ContentDialog,
  Disclosure,
  Field,
  GuideLink,
  Notice,
  Select,
} from './ui';

const descriptions: Record<GuideTopic, string> = {
  setup: '跟着页面提示，完成代理、账号与首次登录。',
  proxy: '添加现成代理或导入订阅，再检测最终出口。',
  account: '填写账号资料，绑定代理并创建独立环境。',
  login: '从绑定的环境启动，完成邮件登录并确认状态。',
  switch: '停止当前环境，再打开另一个账号。',
};
export function GuideCenter({
  onNavigate,
}: {
  onNavigate: (page: WorkspacePage) => void;
}) {
  const { helpOpen, progress } = useGuide();
  const { data, loading, error } = useEnvironmentSettings(helpOpen, false);
  const [accountId, setAccountId] = useState('');
  const [target, setTarget] = useState('browser');
  if (!helpOpen) return null;
  const selected =
    data.accounts.find((item) => item.id === accountId) || data.accounts[0];
  const start = (topic: GuideTopic) => {
    guideStore.start(
      topic,
      selected?.id,
      selected?.provider === 'claude'
        ? (target as 'browser' | 'app')
        : 'browser',
    );
    onNavigate('accounts');
  };
  return (
    <ContentDialog
      title="帮助与引导"
      onClose={guideStore.closeHelp}
      footer={<Button onClick={guideStore.closeHelp}>关闭</Button>}
    >
      {progress && (
        <Notice
          action={
            <Button
              onClick={() => {
                guideStore.resume();
                onNavigate('accounts');
              }}
            >
              继续引导
            </Button>
          }
        >
          上次进行到「{guideTopics[progress.topic]}」。
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <div>
        {(['setup', 'proxy', 'account'] as GuideTopic[]).map((topic) => (
          <div className="guide-topic" key={topic}>
            <div>
              <strong>{guideTopics[topic]}</strong>
              <p>{descriptions[topic]}</p>
            </div>
            <Button onClick={() => start(topic)} disabled={loading}>
              开始
            </Button>
          </div>
        ))}
      </div>
      {data.accounts.length > 0 && (
        <>
          <Field label="要使用的账号">
            <Select
              label="引导账号"
              value={selected?.id || ''}
              options={data.accounts.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
              onChange={(id) => {
                setAccountId(id);
                setTarget('browser');
              }}
            />
          </Field>
          <Field label="使用方式">
            <Select
              label="引导使用方式"
              value={target}
              onChange={setTarget}
              options={[
                { value: 'browser', label: '独立浏览器' },
                ...(selected?.provider === 'claude'
                  ? [{ value: 'app', label: 'Claude App' }]
                  : []),
              ]}
            />
          </Field>
          {(['login', 'switch'] as GuideTopic[]).map((topic) => (
            <div className="guide-topic" key={topic}>
              <div>
                <strong>{guideTopics[topic]}</strong>
                <p>{descriptions[topic]}</p>
              </div>
              <Button onClick={() => start(topic)}>开始</Button>
            </div>
          ))}
        </>
      )}
      <GuideLink {...accountGuide} />
      <GuideLink {...proxyGuide} />
      <Disclosure title="日常使用注意项">
        <p>
          从账号管理进入对应的专用浏览器或
          App。邮件链接复制到此账号绑定的浏览器打开，浏览器和 App 分别确认登录。
        </p>
        <p>
          切号时停止当前环境，再打开另一个账号，通常不需要 Claude Log
          out。修改代理、节点或出口前，先停止使用该配置的环境。
        </p>
        <p>
          在代理配置中为明确需要直连的国内或公司内网服务设置域名规则；在设置的组件管理中安装、更新或卸载组件。
        </p>
      </Disclosure>
      <Disclosure title="遇到登录或代理问题">
        <p>
          代理失败时核对地址、协议、认证和上游线路后重新检测。出口不一致时核对所选节点与指定
          IP。
        </p>
        <p>
          没有邮件时检查邮箱与垃圾邮件目录。account_session_invalid
          表示当前凭据无效，可重新通过邮箱登录。
        </p>
        <p>
          代理检测通过、实际环境出口和登录身份分别确认；待确认表示还缺少观测结果。
        </p>
      </Disclosure>
    </ContentDialog>
  );
}
