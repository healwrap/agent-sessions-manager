import { structuredPatch } from 'diff';
import { ChevronRight, Wrench } from 'lucide-react';
import type { Detail, PromptSnapshot } from '../../lib/types';
import { Markdown } from '../markdown';
import { Payload } from './payload';

function ToolCatalog({
  tools,
}: {
  tools: NonNullable<PromptSnapshot['tools']>;
}) {
  if (!tools.length) return <p className="metadata-note">未记录工具。</p>;
  return (
    <div className="prompt-tool-catalog">
      {tools.map((tool, index) => (
        <details className="prompt-tool-item" key={`${tool.name}:${index}`}>
          <summary className="prompt-tool-summary">
            <ChevronRight className="prompt-tool-chevron" size={12} />
            <Wrench className="prompt-tool-icon" size={12} />
            <span className="prompt-tool-name" title={tool.name}>
              {tool.name}
            </span>
            <span className="prompt-tool-description">{tool.description}</span>
          </summary>
          <div className="prompt-tool-definition">
            {tool.description && <p>{tool.description}</p>}
            <Payload
              text={JSON.stringify(tool.parameters ?? {})}
              label={`${tool.name} 参数 JSON`}
              className="prompt-tool-tree"
            />
          </div>
        </details>
      ))}
    </div>
  );
}

function DiffSection({
  title,
  before,
  after,
}: {
  title: string;
  before: string;
  after: string;
}) {
  if (before === after) return null;
  const patch = structuredPatch('', '', before, after, undefined, undefined, {
    context: 3,
  });
  return (
    <section className="prompt-diff-section">
      <h3>{title}</h3>
      <pre className="prompt-diff">
        {patch.hunks
          .flatMap((hunk, index) => [
            ...(index ? [{ kind: 'meta', text: '' }] : []),
            {
              kind: 'meta',
              text: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
            },
            ...hunk.lines
              .filter((line) => !line.startsWith('\\'))
              .map((line) => ({
                kind: line.startsWith('+')
                  ? 'added'
                  : line.startsWith('-')
                    ? 'removed'
                    : 'context',
                text: line,
              })),
          ])
          .map((line, index) => (
            <span className={`prompt-diff-${line.kind}`} key={index}>
              {line.text || ' '}
              {'\n'}
            </span>
          ))}
      </pre>
    </section>
  );
}

export function PromptContent({
  detail,
  tab,
}: {
  detail: Detail;
  tab: string;
}) {
  const prompt = detail.prompt_snapshot!;
  if (tab === '工具') return <ToolCatalog tools={prompt.tools ?? []} />;
  if (tab === '差异') {
    const previous = detail.previous_prompt_snapshot;
    if (!previous) return null;
    return (
      <div className="prompt-diff-sections">
        <DiffSection
          title="系统提示词"
          before={previous.system}
          after={prompt.system}
        />
        <DiffSection
          title="工具"
          before={JSON.stringify(previous.tools, null, 2)}
          after={JSON.stringify(prompt.tools, null, 2)}
        />
      </div>
    );
  }
  return prompt.system ? (
    <div className="markdownPayload prompt-system">
      <Markdown text={prompt.system} />
    </div>
  ) : (
    <p className="metadata-note">未记录系统提示词。</p>
  );
}
