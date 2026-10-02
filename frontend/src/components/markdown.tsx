import { marked, type Token } from 'marked';
import { memo, type ReactNode } from 'react';
import { copyText } from '../lib/api';
import { sessionStore } from '../state/session-store';
import { Icon } from './primitives';
import { tokenStyle, useCodeTokens } from '../lib/code-highlighter';
function CodeText({ code, language }: { code: string; language?: string }) {
  const lines = useCodeTokens(code, language);
  return (
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
  );
}
const safeHref = (href: string) =>
  /^(https?:|mailto:)/i.test(href) ? href : undefined;
function tokens(items: Token[] = []): ReactNode[] {
  return items.map((token, index) => {
    const t = token as Token & {
      tokens?: Token[];
      items?: { tokens: Token[]; checked?: boolean }[];
      header?: { tokens: Token[] }[];
      rows?: { tokens: Token[] }[][];
      href?: string;
      text?: string;
      lang?: string;
      depth?: number;
      ordered?: boolean;
      start?: number;
    };
    const nested = () => tokens(t.tokens);
    let node: ReactNode;
    switch (t.type) {
      case 'space':
        return null;
      case 'paragraph':
        node = <p>{nested()}</p>;
        break;
      case 'heading': {
        const Tag = `h${t.depth}` as 'h1';
        node = <Tag>{nested()}</Tag>;
        break;
      }
      case 'text':
        node = t.tokens ? nested() : t.text;
        break;
      case 'escape':
        node = t.text;
        break;
      case 'strong':
        node = <strong>{nested()}</strong>;
        break;
      case 'em':
        node = <em>{nested()}</em>;
        break;
      case 'del':
        node = <del>{nested()}</del>;
        break;
      case 'codespan':
        node = <code>{t.text}</code>;
        break;
      case 'br':
        node = <br />;
        break;
      case 'hr':
        node = <hr />;
        break;
      case 'blockquote':
        node = <blockquote>{nested()}</blockquote>;
        break;
      case 'link':
        node = (
          <a href={safeHref(t.href || '')} target="_blank" rel="noreferrer">
            {nested()}
          </a>
        );
        break;
      case 'image':
        node = (
          <span>
            {t.text || '图片'}
            {t.href ? ' · ' + t.href : ''}
          </span>
        );
        break;
      case 'list': {
        const Tag = t.ordered ? 'ol' : 'ul';
        node = (
          <Tag start={t.start}>
            {t.items?.map((item, i) => (
              <li key={i}>{tokens(item.tokens)}</li>
            ))}
          </Tag>
        );
        break;
      }
      case 'code':
        node = (
          <div className="markdown-code">
            <div className="markdown-code-header">
              <span>{t.lang || '代码'}</span>
              <button
                onClick={() =>
                  void copyText(t.text || '')
                    .then(() => sessionStore.notify('已复制代码。'))
                    .catch((error) => sessionStore.notify(String(error)))
                }
              >
                <Icon name="copy" />
                复制
              </button>
            </div>
            <pre>
              <CodeText code={t.text || ''} language={t.lang} />
            </pre>
          </div>
        );
        break;
      case 'table':
        node = (
          <div className="markdown-table-scroll">
            <table>
              <thead>
                <tr>
                  {t.header?.map((cell, i) => (
                    <th key={i}>{tokens(cell.tokens)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows?.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j}>{tokens(cell.tokens)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        break;
      default:
        node = t.text || t.raw;
    }
    return (
      <span key={index} style={{ display: 'contents' }}>
        {node}
      </span>
    );
  });
}
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return <div className="markdown-body">{tokens(marked.lexer(text))}</div>;
});
