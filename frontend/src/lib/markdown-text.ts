import { marked, type Token } from 'marked';

// Plain excerpts for compact cards; the independent message keeps its full formatting.
function plain(tokens: Token[]): string {
  return tokens
    .map((token): string => {
      if (token.type === 'list')
        return token.items
          .map((item: { tokens: Token[] }) => plain(item.tokens))
          .join(' ');
      if (token.type === 'table')
        return [token.header, ...token.rows]
          .map((row: { tokens: Token[] }[]) =>
            row.map((cell) => plain(cell.tokens)).join(' '),
          )
          .join(' ');
      if ('tokens' in token && token.tokens) return plain(token.tokens);
      if (token.type === 'space' || token.type === 'hr') return ' ';
      return 'text' in token ? token.text : token.raw;
    })
    .join(' ');
}

export function markdownText(text: string): string {
  return plain(
    marked.lexer(
      text.replace(/:::writing\{[^}]*\}\s*|(?:^|\s):::(?=\s|$)/g, ' '),
    ),
  )
    .replace(/\s+/g, ' ')
    .trim();
}
