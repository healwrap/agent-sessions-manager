// Adapted from DeepSeek Harness OverviewSection (MIT); see frontend/public/harness-license.txt.
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon } from '../primitives';
export function OverviewSection({
  label,
  onOpen,
  actions,
  children,
}: {
  label: string;
  onOpen: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(false);
  const measureOverflow = useCallback((preview: HTMLElement) => {
    setHasMore(
      preview.scrollHeight - preview.clientHeight - preview.scrollTop > 1,
    );
  }, []);

  useLayoutEffect(() => {
    const preview = previewRef.current as HTMLDivElement;
    const measure = () => {
      measureOverflow(preview);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(preview);
    for (const child of preview.children) observer.observe(child);
    return () => {
      observer.disconnect();
    };
  }, [children, measureOverflow]);

  return (
    <section className="overview-section">
      <h3 className="overview-heading">
        <button type="button" className="overview-title" onClick={onOpen}>
          <span>{label}</span>
          <Icon name="right" className="overview-title-icon" />
        </button>
        {actions}
      </h3>
      <div
        ref={previewRef}
        className="overview-preview"
        data-summary-scroll-region=""
        data-scroll-more={hasMore || undefined}
        onScroll={(event) => {
          measureOverflow(event.currentTarget);
        }}
      >
        {children}
      </div>
    </section>
  );
}
