import { useState } from 'react';

export function MarkdownImage({
  src,
  alt,
  href,
}: {
  src?: string;
  alt: string;
  href?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return (
      <span className="markdown-image-alt" title={href}>
        图片无法预览 · {alt || '图片'}
      </span>
    );
  return (
    <a
      className="markdown-image"
      href={src}
      target="_blank"
      rel="noreferrer"
      aria-label={`打开${alt || '图片'}`}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </a>
  );
}
