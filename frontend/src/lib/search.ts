export type SearchMode = 'words' | 'literal';
export function matchesSearch(text: string, query: string, mode: SearchMode) {
  const value = query.trim().toLowerCase();
  const terms = mode === 'literal' ? [value] : value.split(/\s+/u);
  const folded = text.toLowerCase();
  return terms.every((term) => folded.includes(term));
}
