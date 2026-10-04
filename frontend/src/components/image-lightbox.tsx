// Adapted from DeepSeek Harness ImageLightbox (MIT); see harness-license.txt.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './primitives';

export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        closeRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [onClose]);

  // A body portal keeps the preview outside clipped/animated message containers.
  return createPortal(
    <div
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="原图预览"
    >
      <div
        className="image-lightbox-mask"
        aria-hidden="true"
        onMouseDown={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      {failed ? (
        <div className="image-lightbox-error" role="status">
          图片无法预览 · {alt || '图片'}
        </div>
      ) : (
        <img
          className="image-lightbox-image"
          src={src}
          alt={alt}
          onError={() => setFailed(true)}
        />
      )}
      <button
        ref={closeRef}
        type="button"
        className="image-lightbox-close"
        aria-label="关闭原图预览"
        onClick={onClose}
      >
        <Icon name="close" />
      </button>
    </div>,
    document.body,
  );
}
