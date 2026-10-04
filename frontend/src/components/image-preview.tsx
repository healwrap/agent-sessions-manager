import { useCallback, useState, type ReactNode } from 'react';
import { ImageLightbox } from './image-lightbox';

export function ImagePreview({
  src,
  alt,
  className = '',
  fallback,
  preview = true,
}: {
  src: string;
  alt: string;
  className?: string;
  fallback: ReactNode;
  preview?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (failed) return fallback;
  const image = (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
  // Markdown images inside links keep their enclosing link's action.
  if (!preview) return image;
  return (
    <>
      <button
        type="button"
        className={'image-preview ' + className}
        title="查看原图"
        aria-label={`查看原图：${alt || '图片'}`}
        aria-haspopup="dialog"
        onClick={(event) => {
          // WebKit on macOS does not focus buttons on pointer clicks.
          event.currentTarget.focus({ preventScroll: true });
          setOpen(true);
        }}
      >
        {image}
      </button>
      {open && <ImageLightbox src={src} alt={alt} onClose={close} />}
    </>
  );
}
