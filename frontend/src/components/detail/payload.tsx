export function Payload({
  text,
  raw = false,
}: {
  text: string;
  raw?: boolean;
}) {
  if (!raw) {
    try {
      return <JsonNode value={JSON.parse(text)} />;
    } catch {}
  }
  return <pre>{text}</pre>;
}
function JsonNode({
  value,
  label = '',
  depth = 0,
  budget = { count: 0 },
}: {
  value: unknown;
  label?: string;
  depth?: number;
  budget?: { count: number };
}) {
  if (++budget.count > 500 || depth > 12)
    return (
      <pre className="json-leaf">
        {label}
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    return (
      <details open={depth < 2}>
        <summary>
          {label}
          {Array.isArray(value)
            ? `Array (${entries.length})`
            : `Object (${entries.length})`}
        </summary>
        {entries.map(([key, item]) => (
          <JsonNode
            key={key}
            value={item}
            label={key + ': '}
            depth={depth + 1}
            budget={budget}
          />
        ))}
      </details>
    );
  }
  return (
    <div className="json-leaf">
      <span className="json-key">{label}</span>
      <span
        className={
          typeof value === 'string'
            ? 'json-string'
            : typeof value === 'number'
              ? 'json-number'
              : ''
        }
      >
        {JSON.stringify(value)}
      </span>
    </div>
  );
}
