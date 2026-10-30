import { useEffect, useRef, useState } from 'react';
import { copyText } from '../lib/api';
import { sessionStore } from '../state/session-store';
import { tokenStyle, useCodeTokens } from '../lib/code-highlighter';
import { stringWrapping } from '../lib/string-wrapping';
import { Icon } from './primitives';

export function MarkdownCode({
  code,
  language,
}: {
  code: string;
  language?: string;
}) {
  const lines = useCodeTokens(code, language);
  const [wrapped, setWrapped] = useState(stringWrapping.getDefault),
    [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className="markdown-code">
      <div className="markdown-code-header">
        <span>{language || '代码块'}</span>
        <span className="markdown-code-actions">
          <button
            data-tooltip={wrapped ? '取消自动换行' : '自动换行'}
            aria-label="自动换行"
            aria-pressed={wrapped}
            onClick={() => {
              stringWrapping.setDefault(!wrapped);
              setWrapped(!wrapped);
            }}
          >
            <Icon name="wrap" />
          </button>
          <button
            data-tooltip={copied ? '已复制' : '复制代码'}
            aria-label={copied ? '已复制' : '复制代码'}
            onClick={() =>
              void copyText(code)
                .then(() => {
                  setCopied(true);
                  sessionStore.notify('已复制代码。', { tone: 'success' });
                  clearTimeout(timer.current);
                  timer.current = setTimeout(() => setCopied(false), 1000);
                })
                .catch((error) =>
                  sessionStore.notify(String(error), { tone: 'error' }),
                )
            }
          >
            <Icon name={copied ? 'check' : 'copy'} />
          </button>
        </span>
      </div>
      <pre data-wrapped={wrapped}>
        <code>
          {lines
            ? lines.map((line, i) => (
                <span key={i}>
                  {i > 0 && '\n'}
                  {line.map((token, j) => (
                    <span key={j} style={tokenStyle(token)}>
                      {token.content}
                    </span>
                  ))}
                </span>
              ))
            : code}
        </code>
      </pre>
    </div>
  );
}
