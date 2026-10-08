export type ResourceTarget = {
  kind: 'web' | 'file' | 'anchor';
  target: string;
};

export function resourceTarget(href: string): ResourceTarget | null {
  const value = href.trim();
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) return null;
  if (value.startsWith('#')) return { kind: 'anchor', target: value };
  if (/^(https?:|mailto:|\/\/)/i.test(value)) {
    try {
      const url = new URL(value.startsWith('//') ? `https:${value}` : value);
      return { kind: 'web', target: url.href };
    } catch {
      return null;
    }
  }
  if (/^file:/i.test(value)) {
    try {
      const url = new URL(value);
      return { kind: 'file', target: url.href };
    } catch {
      return null;
    }
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^[a-z]:[\\/]/i.test(value))
    return null;
  try {
    return { kind: 'file', target: decodeURIComponent(value.split(/[?#]/)[0]) };
  } catch {
    return null;
  }
}
