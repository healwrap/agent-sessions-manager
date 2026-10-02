import type { Detail } from '../../lib/types';
import { Payload } from './payload';

export function ToolSchema({
  detail,
  preview = false,
}: {
  detail: Detail;
  preview?: boolean;
}) {
  return detail.tool_schema ? (
    <div className="tool-schema" data-preview={preview}>
      <header className="schema-intro">
        <h3>{detail.tool_schema.name}</h3>
        {detail.tool_schema.description && (
          <p>{detail.tool_schema.description}</p>
        )}
      </header>
      <section>
        <h4 className="schema-parameters-title">参数</h4>
        <Payload
          text={JSON.stringify(detail.tool_schema.parameters)}
          preview={preview}
          label={`${detail.tool_schema.name} 参数 JSON`}
          className="schema-tree"
        />
      </section>
    </div>
  ) : (
    <p className="metadata-note">原始记录未保存工具 Schema。</p>
  );
}
