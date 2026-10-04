import JSON5 from 'json5';

/** Inspect static object literals without evaluating call code or changing the source. */
export function parseObjectPayload(text: string): object | undefined {
  for (const parse of [JSON.parse, JSON5.parse]) {
    try {
      const value: unknown = parse(text, (_key: string, item: unknown) => {
        // JSON copy would turn these values into null, so keep their source text.
        if (typeof item === 'number' && !Number.isFinite(item))
          throw new SyntaxError('Non-finite number');
        return item;
      });
      if (value !== null && typeof value === 'object') return value;
    } catch {}
  }
}
