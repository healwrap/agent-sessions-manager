import { useState } from 'react';
import {
  Field,
  Panel,
  SearchField,
  TextArea,
  TextInput,
} from '../components/ui';

export function InputPreview() {
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [link, setLink] = useState('');
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
      </div>
    </Panel>
  );
}
