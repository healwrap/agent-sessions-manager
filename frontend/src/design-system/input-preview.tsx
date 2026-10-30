import { useState } from 'react';
import {
  Field,
  NumberField,
  Panel,
  SearchField,
  Switch,
  TextArea,
  TextInput,
} from '../components/ui';

export function InputPreview() {
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [link, setLink] = useState('');
  const [fontSize, setFontSize] = useState(14);
  const [enabled, setEnabled] = useState(true);
  const [switchLoading, setSwitchLoading] = useState(false);
  return (
    <Panel title="输入框与占位提示">
      <div className="ui-stack">
        <Field label="单行输入" htmlFor="catalog-input-name">
          <TextInput
            id="catalog-input-name"
            placeholder="请输入名称"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="搜索输入">
          <SearchField
            label="公共搜索示例"
            placeholder="搜索名称或内容"
            value={query}
            onChange={setQuery}
          />
        </Field>
        <Field label="完整登录链接" htmlFor="catalog-input-link">
          <TextArea
            id="catalog-input-link"
            placeholder="粘贴刚复制的 https:// 登录链接"
            value={link}
            onChange={(event) => setLink(event.target.value)}
          />
        </Field>
        <Field label="禁用状态" htmlFor="catalog-input-disabled">
          <TextInput
            id="catalog-input-disabled"
            placeholder="暂不可输入"
            disabled
          />
        </Field>
        <Field label="只读内容" htmlFor="catalog-input-readonly">
          <TextInput id="catalog-input-readonly" value="当前配置" readOnly />
        </Field>
        <Field label="数字步进" htmlFor="catalog-input-number">
          <NumberField
            id="catalog-input-number"
            label="预览字号"
            value={fontSize}
            min={12}
            max={20}
            onChange={setFontSize}
          />
        </Field>
        <Field label="开关" htmlFor="catalog-input-switch">
          <Switch
            id="catalog-input-switch"
            label="启用示例"
            checked={enabled}
            loading={switchLoading}
            onChange={(next) => {
              setSwitchLoading(true);
              setTimeout(() => {
                setEnabled(next);
                setSwitchLoading(false);
              }, 1200);
            }}
          />
        </Field>
      </div>
    </Panel>
  );
}
