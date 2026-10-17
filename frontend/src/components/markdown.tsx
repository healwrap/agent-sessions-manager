import { marked, type Token } from 'marked';
import { Fragment, memo, type ReactNode } from 'react';
import { MarkdownCode } from './markdown-code';
import { MarkdownTable } from './markdown-table';
import { MarkdownImage } from './markdown-image';
import { ResourceLink } from './resource-link';
type Images = { href: string; src: string }[];
function tokens(
  items: Token[] = [],
  images: Images = [],
  inLink = false,
  inQuote = false,
): ReactNode[] {
  return items.map((token, index) => {
    const t = token as Token & {
      tokens?: Token[];
      items?: { tokens: Token[]; checked?: boolean }[];
      header?: { tokens: Token[] }[];
      rows?: { tokens: Token[] }[][];
      align?: ('left' | 'center' | 'right' | null)[];
      href?: string;
      text?: string;
      lang?: string;
      depth?: number;
      ordered?: boolean;
      start?: number;
    };
    const nested = () => tokens(t.tokens, images, inLink, inQuote);
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
        node = (
          <blockquote>{tokens(t.tokens, images, inLink, true)}</blockquote>
        );
        break;
      case 'link':
        node = (
          <ResourceLink href={t.href || ''}>
            {tokens(t.tokens, images, true, inQuote)}
          </ResourceLink>
        );
        break;
      case 'image':
        node = (
          <MarkdownImage
            key={t.href}
            href={t.href}
            alt={t.text || ''}
            src={images.find((image) => image.href === t.href)?.src}
            inLink={inLink}
          />
        );
        break;
      case 'list': {
        const Tag = t.ordered ? 'ol' : 'ul';
        node = (
          <Tag start={t.start}>
            {t.items?.map((item, i) => (
              <li key={i}>
                {typeof item.checked === 'boolean' && (
                  <input
                    type="checkbox"
                    checked={item.checked}
                    readOnly
                    aria-label={item.checked ? '已完成' : '未完成'}
                  />
                )}
                {tokens(item.tokens, images, inLink, inQuote)}
              </li>
            ))}
          </Tag>
        );
        break;
      }
      case 'code':
        node = <MarkdownCode code={t.text || ''} language={t.lang} />;
        break;
      case 'table':
        node = (
          <MarkdownTable
            wide={(t.header?.length || 0) >= 4 && !inQuote}
            markdown={t.raw}
          >
            <table>
              <thead>
                <tr>
                  {t.header?.map((cell, i) => (
                    <th
                      key={i}
                      style={{ textAlign: t.align?.[i] || undefined }}
                    >
                      {tokens(cell.tokens, images)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows?.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        style={{ textAlign: t.align?.[j] || undefined }}
                      >
                        {tokens(cell.tokens, images)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </MarkdownTable>
        );
        break;
      default:
        node = t.text || t.raw;
    }
    return <Fragment key={index}>{node}</Fragment>;
  });
}
export const Markdown = memo(function Markdown({
  text,
  images,
  variant = 'body',
}: {
  text: string;
  images?: Images;
  variant?: 'body' | 'compact';
}) {
  return (
    <div
      className="markdown-body"
      data-markdown-variant={variant === 'compact' ? variant : undefined}
    >
      {tokens(marked.lexer(text), images)}
    </div>
  );
});
