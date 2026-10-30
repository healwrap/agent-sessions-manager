import { ImagePreview } from './image-preview';

export function MarkdownImage({
  src,
  alt,
  href,
  inLink = false,
}: {
  src?: string;
  alt: string;
  href?: string;
  inLink?: boolean;
}) {
  const fallback = (
    <span className="markdown-image-alt" data-tooltip={href}>
      图片无法预览 · {alt || '图片'}
    </span>
  );
  if (!src) return fallback;
  return (
    <ImagePreview
      key={src}
      className="markdown-image"
      src={src}
      alt={alt}
      fallback={fallback}
      preview={!inLink}
    />
  );
}
