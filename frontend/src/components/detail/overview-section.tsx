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
  const sectionRef = useRef<HTMLElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(false);
  const measureOverflow = useCallback((preview: HTMLElement) => {
    setHasMore(
      preview.scrollHeight - preview.clientHeight - preview.scrollTop > 1,
    );
  }, []);

  useLayoutEffect(() => {
    const preview = previewRef.current as HTMLDivElement;
    const content = contentRef.current as HTMLDivElement;
    const section = sectionRef.current as HTMLElement;
    const measure = () => {
      // WebKit can resolve max-height: max-content to the shrunken flex height.
      // Measure an unconstrained child so short sections release their unused
      // space and long sections share the remaining height, as in DSH.
      const height = `${Math.ceil(content.getBoundingClientRect().height)}px`;
      if (
        section.style.getPropertyValue('--overview-content-height') !== height
      )
        section.style.setProperty('--overview-content-height', height);
      measureOverflow(preview);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(preview);
    observer.observe(content);
    return () => {
      observer.disconnect();
    };
  }, [children, measureOverflow]);

  return (
    <section ref={sectionRef} className="overview-section">
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
        <div ref={contentRef} className="overview-preview-content">
          {children}
        </div>
      </div>
    </section>
  );
}
