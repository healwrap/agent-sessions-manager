import { useEffect, useRef, useState, type ReactNode } from 'react';
import { copyText } from '../lib/api';
import { sessionStore } from '../state/session-store';
import { Dialog, IconButton } from './primitives';

export function MarkdownTable({
  children,
  wide,
  markdown,
}: {
  children: ReactNode;
  wide: boolean;
  markdown: string;
}) {
  const [expanded, setExpanded] = useState(false),
    [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const actions = (
    <div className="markdown-table-actions">
      <IconButton
        icon={copied ? 'check' : 'copy'}
        label={copied ? '已复制表格' : '复制表格'}
        onClick={() =>
          void copyText(markdown)
            .then(() => {
              setCopied(true);
              clearTimeout(timer.current);
              timer.current = setTimeout(() => setCopied(false), 1000);
            })
            .catch((error) => sessionStore.notify(String(error)))
        }
      />
      <IconButton
        icon={expanded ? 'close' : 'expand'}
        label={expanded ? '关闭表格' : '展开表格'}
        aria-haspopup={expanded ? undefined : 'dialog'}
        onClick={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          setExpanded(!expanded);
        }}
      />
    </div>
  );
  return (
    <>
      <div
        className={
          'markdown-table-block ' + (wide ? 'md-table-wide' : 'md-table-fill')
        }
      >
        {actions}
        <div
          className="markdown-table-scroll"
          tabIndex={0}
          aria-label="表格内容"
        >
          {children}
        </div>
      </div>
      {expanded && (
        <Dialog
          open
          onClose={() => setExpanded(false)}
          title="展开表格"
          className="markdown-table-dialog"
        >
          <div className="markdown-body">
            {actions}
            <div
              className="markdown-table-scroll"
              tabIndex={0}
              aria-label="展开的表格内容"
            >
              {children}
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
