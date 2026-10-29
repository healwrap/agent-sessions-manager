import { useState } from 'react';
import { accountGuide, proxyGuide } from '../lib/guide-links';
import GuideDemoDialog from '../components/guide-demo-dialog';
import {
  Button,
  Disclosure,
  EditorDialog,
  Field,
  GuideLink,
  GuidedTour,
  Panel,
  Select,
  TextInput,
  type GuidedStep,
} from '../components/ui';

export function GuidePreview() {
  const [stage, setStage] = useState(-1);
  const [dialog, setDialog] = useState(false);
  const [demo, setDemo] = useState(false);
  const [name, setName] = useState('');
  const [route, setRoute] = useState('proxy');
  const definitions: GuidedStep[] = [
    {
      id: 'preview-open',
      selector: '[data-guide="preview-open"]',
      title: '点击真实控件继续',
      chapter: '组件预览 · 1 / 3',
      body: <p>点击高亮的按钮打开编辑弹窗。</p>,
    },
    {
      id: 'preview-edit',
      selector: '[data-guide="preview-editor"]',
      title: '填写后再提交',
      chapter: '组件预览 · 2 / 3',
      body: <p>可以输入文字、展开选择器。保存成功后，引导才进入下一步。</p>,
    },
    {
      id: 'preview-result',
      selector: '[data-guide="preview-result"]',
      title: '完成这段操作',
      chapter: '组件预览 · 3 / 3',
      body: <p>表单已经提交。引导仅维护页面内示例状态。</p>,
      onContinue: () => setStage(-1),
      continueLabel: '完成示例',
    },
  ];
  return (
    <Panel title="页面操作引导">
      <div className="ui-stack">
        <Button onClick={() => setStage(0)}>体验 Tour 引导</Button>
        <Button onClick={() => setDemo(true)}>体验示例账号演示</Button>
        <Button
          data-guide="preview-open"
          onClick={() => {
            setDialog(true);
            if (stage >= 0) setStage(1);
          }}
        >
          打开示例表单
        </Button>
        <div data-guide="preview-result">
          {name ? '已保存示例：' + name : '等待提交示例'}
        </div>
        <GuideLink {...accountGuide} />
        <GuideLink {...proxyGuide} />
        <Disclosure compact title="紧凑折叠区">
          <div className="ui-actions">
            <Button size="small">代理配置</Button>
            <Button size="small">添加账号</Button>
          </div>
          <p>用于帮助弹窗中的操作与简短提示。</p>
        </Disclosure>
      </div>
      {demo && <GuideDemoDialog onClose={() => setDemo(false)} />}
      {dialog && (
        <EditorDialog
          title="引导组件示例"
          guide="preview-editor"
          busy={false}
          onClose={() => {
            setDialog(false);
            setStage(-1);
          }}
          onSubmit={(event) => {
            event.preventDefault();
            setDialog(false);
            if (stage >= 0) setStage(2);
          }}
          footer={
            <Button variant="primary" type="submit">
              保存示例
            </Button>
          }
        >
          <Field label="示例名称" htmlFor="guide-preview-name">
            <TextInput
              id="guide-preview-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="示例代理">
            <Select
              label="引导示例代理"
              value={route}
              onChange={setRoute}
              options={[
                { value: 'proxy', label: '专用代理' },
                { value: 'other', label: '另一个代理' },
              ]}
            />
          </Field>
        </EditorDialog>
      )}
      <GuidedTour
        step={stage >= 0 ? definitions[stage] : null}
        onPause={() => setStage(-1)}
        onReveal={() => {
          if (stage === 1) setDialog(true);
        }}
      />
    </Panel>
  );
}
