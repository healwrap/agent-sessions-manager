import type { Detail, SourceBlock } from '../../lib/types';
import { sessionStore } from '../../state/session-store';
import { Icon } from '../primitives';

function Block({ block, index }: { block: SourceBlock; index: number }) {
  const label = `块 #${index + 1} ${block.type}`;
  if (block.attachment) {
    return (
      <details className="source-attachment">
        <summary>
          <span className="source-block-label">{label}</span>
          <span>{block.attachment.name || '图片'}</span>
        </summary>
        <pre className="source-block-content">{block.content}</pre>
      </details>
    );
  }
  return (
    <section className="source-block">
      {block.ref ? (
        <button
          type="button"
          className="source-block-jump"
          aria-label={`打开块 #${index + 1} 的工具调用概述`}
          onClick={() => void sessionStore.selectEvent(block.ref!, true)}
        >
          <span className="source-block-label">{label}</span>
          <Icon name="chevron" />
        </button>
      ) : (
        <div className="source-block-heading">
          <span className="source-block-label">{label}</span>
        </div>
      )}
      <pre className="source-block-content">{block.content}</pre>
    </section>
  );
}

export function SourceBlocks({ detail }: { detail: Detail }) {
  return (
    <div className="source-blocks">
      {detail.source_blocks?.map((block, index) => (
        <Block block={block} index={index} key={index} />
      ))}
    </div>
  );
}
